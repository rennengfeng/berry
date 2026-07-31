#!/usr/bin/env python3
from __future__ import annotations

import re
import sys
from pathlib import Path


ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()


def read(rel: str) -> str:
    path = ROOT / rel
    if not path.exists():
        raise SystemExit(f"DashScope Native price sync patch failed: missing {rel}")
    return path.read_text(encoding="utf-8")


def write(rel: str, text: str) -> None:
    (ROOT / rel).write_text(text, encoding="utf-8")


def replace_once(rel: str, old: str, new: str, label: str) -> None:
    text = read(rel)
    if new in text:
        return
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"DashScope Native price sync patch failed: {label} matched {count} anchors in {rel}")
    write(rel, text.replace(old, new, 1))


def insert_after(rel: str, anchor: str, snippet: str, marker: str, label: str) -> None:
    text = read(rel)
    if marker in text:
        return
    if anchor not in text:
        raise SystemExit(f"DashScope Native price sync patch failed: {label} anchor not found in {rel}")
    write(rel, text.replace(anchor, anchor + snippet, 1))


def find_upstream_dto_file() -> str | None:
    for preferred_rel in ("relaykit/dto/ratio_sync.go", "dto/ratio_sync.go"):
        preferred = ROOT / preferred_rel
        if preferred.exists():
            return preferred_rel
    for path in ROOT.rglob("*.go"):
        rel = path.relative_to(ROOT).as_posix()
        if rel.startswith(("web/", "vendor/")):
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        if "type UpstreamDTO struct" in text and 'json:"endpoint"' in text:
            return rel
    return None


def patch_dto() -> bool:
    rel = find_upstream_dto_file()
    if rel is None:
        raise SystemExit("DashScope Native price sync patch failed: UpstreamDTO source not found; expected relaykit/dto/ratio_sync.go in official latest source")
    text = read(rel)
    if 'json:"type,omitempty"' in text:
        return True
    if '\tEndpoint string `json:"endpoint"`\n' not in text:
        if '\tBaseURL  string `json:"base_url" binding:"required"`\n' not in text:
            raise SystemExit(f"DashScope Native price sync patch failed: UpstreamDTO field anchor not found in {rel}")
        text = text.replace(
            '\tBaseURL  string `json:"base_url" binding:"required"`\n',
            '\tBaseURL  string `json:"base_url" binding:"required"`\n\tEndpoint string `json:"endpoint"`\n\tType     int    `json:"type,omitempty"`\n',
            1,
        )
        write(rel, text)
        return True
    write(
        rel,
        text.replace(
            '\tEndpoint string `json:"endpoint"`\n',
            '\tEndpoint string `json:"endpoint"`\n\tType     int    `json:"type,omitempty"`\n',
            1,
        ),
    )
    return True


def patch_ratio_sync(dto_has_type: bool) -> None:
    patch_billing_setting()
    patch_existing_pricing_catalog_file()
    text = read("controller/ratio_sync.go")
    if '"net/url"' not in text:
        text = text.replace('\t"net/http"\n', '\t"net/http"\n\t"net/url"\n', 1)
    if '"github.com/QuantumNous/new-api/constant"' not in text:
        text = text.replace(
            '\t"github.com/QuantumNous/new-api/common"\n',
            '\t"github.com/QuantumNous/new-api/common"\n\t"github.com/QuantumNous/new-api/constant"\n',
            1,
        )
    if "billing_setting.DashScopeNativePricingField," not in text:
        text = text.replace(
            '\tbilling_setting.BillingExprField,\n',
            '\tbilling_setting.BillingExprField,\n\tbilling_setting.DashScopeNativePricingField,\n',
            1,
        )
    write("controller/ratio_sync.go", text)

    replace_once(
        "controller/ratio_sync.go",
        '''func normalizeSyncValue(field string, value any) any {
\tif numericPricingSyncFields[field] {
\t\tif parsed, ok := asFloat64(value); ok {
\t\t\treturn parsed
\t\t}
\t}
\treturn value
}
''',
        '''func normalizeSyncValue(field string, value any) any {
\tif field == billing_setting.DashScopeNativePricingField {
\t\treturn compactJSONSyncValue(value)
\t}
\tif numericPricingSyncFields[field] {
\t\tif parsed, ok := asFloat64(value); ok {
\t\t\treturn parsed
\t\t}
\t}
\treturn value
}
''',
        "normalize DashScope Native pricing values",
    )

    insert_after(
        "controller/ratio_sync.go",
        '''func normalizeSyncValue(field string, value any) any {
\tif field == billing_setting.DashScopeNativePricingField {
\t\treturn compactJSONSyncValue(value)
\t}
\tif numericPricingSyncFields[field] {
\t\tif parsed, ok := asFloat64(value); ok {
\t\t\treturn parsed
\t\t}
\t}
\treturn value
}
''',
        r'''
func compactJSONSyncValue(value any) string {
	if value == nil {
		return ""
	}
	if text, ok := value.(string); ok {
		var raw any
		if err := common.Unmarshal([]byte(text), &raw); err == nil {
			if compact, err := common.Marshal(raw); err == nil {
				return string(compact)
			}
		}
		return strings.TrimSpace(text)
	}
	compact, err := common.Marshal(value)
	if err != nil {
		return fmt.Sprintf("%v", value)
	}
	return string(compact)
}

const (
	dashScopeNativePricingRegionDomestic = "domestic"
	dashScopeNativePricingRegionIntl     = "intl"
)

var dashScopeNativeOfficialPricingCatalog = map[string]map[string]billing_setting.DashScopeNativePricing{
	dashScopeNativePricingRegionDomestic: {
		"cosyvoice-v3.5-plus": {Unit: "character", Price: 1.5 / ratio_setting.USD2RMB / 10000},
		"cosyvoice-v3.5-flash": {Unit: "character", Price: 0.8 / ratio_setting.USD2RMB / 10000},
		"qwen-image-2.0":      {Unit: "image", Price: 0.2 / ratio_setting.USD2RMB},
		"qwen-image-2.0-2026-03-03": {Unit: "image", Price: 0.2 / ratio_setting.USD2RMB},
		"qwen-image-2.0-pro":  {Unit: "image", Price: 0.5 / ratio_setting.USD2RMB},
		"qwen-image-2.0-pro-2026-06-22": {Unit: "image", Price: 0.5 / ratio_setting.USD2RMB},
		"qwen-image-2.0-pro-2026-04-22": {Unit: "image", Price: 0.5 / ratio_setting.USD2RMB},
		"qwen-image-2.0-pro-2026-03-03": {Unit: "image", Price: 0.5 / ratio_setting.USD2RMB},
		"happyhorse-1.1-t2v": {
			Unit: "video_second",
			Prices: map[string]float64{
				"480P":  0.45 / ratio_setting.USD2RMB,
				"720P":  0.9 / ratio_setting.USD2RMB,
				"1080P": 1.2 / ratio_setting.USD2RMB,
			},
		},
		"happyhorse-1.1-i2v": {
			Unit: "video_second",
			Prices: map[string]float64{
				"480P":  0.45 / ratio_setting.USD2RMB,
				"720P":  0.9 / ratio_setting.USD2RMB,
				"1080P": 1.2 / ratio_setting.USD2RMB,
			},
		},
		"happyhorse-1.1-r2v": {
			Unit: "video_second",
			Prices: map[string]float64{
				"480P":  0.45 / ratio_setting.USD2RMB,
				"720P":  0.9 / ratio_setting.USD2RMB,
				"1080P": 1.2 / ratio_setting.USD2RMB,
			},
		},
		"happyhorse-1.0-t2v": {
			Unit: "video_second",
			Prices: map[string]float64{
				"720P":  0.9 / ratio_setting.USD2RMB,
				"1080P": 1.6 / ratio_setting.USD2RMB,
			},
		},
		"happyhorse-1.0-i2v": {
			Unit: "video_second",
			Prices: map[string]float64{
				"720P":  0.9 / ratio_setting.USD2RMB,
				"1080P": 1.6 / ratio_setting.USD2RMB,
			},
		},
		"happyhorse-1.0-r2v": {
			Unit: "video_second",
			Prices: map[string]float64{
				"720P":  0.9 / ratio_setting.USD2RMB,
				"1080P": 1.6 / ratio_setting.USD2RMB,
			},
		},
		"happyhorse-1.0-video-edit": {
			Unit: "video_second",
			Prices: map[string]float64{
				"720P":  0.9 / ratio_setting.USD2RMB,
				"1080P": 1.6 / ratio_setting.USD2RMB,
			},
		},
		"wan2.7-t2v": {Unit: "video_second", Prices: map[string]float64{"720P": 0.6 / ratio_setting.USD2RMB, "1080P": 1 / ratio_setting.USD2RMB}},
		"wan2.7-t2v-2026-06-12": {Unit: "video_second", Prices: map[string]float64{"720P": 0.6 / ratio_setting.USD2RMB, "1080P": 1 / ratio_setting.USD2RMB}},
		"wan2.7-t2v-2026-04-25": {Unit: "video_second", Prices: map[string]float64{"720P": 0.6 / ratio_setting.USD2RMB, "1080P": 1 / ratio_setting.USD2RMB}},
		"wan2.7-i2v": {Unit: "video_second", Prices: map[string]float64{"720P": 0.6 / ratio_setting.USD2RMB, "1080P": 1 / ratio_setting.USD2RMB}},
		"wan2.7-i2v-2026-04-25": {Unit: "video_second", Prices: map[string]float64{"720P": 0.6 / ratio_setting.USD2RMB, "1080P": 1 / ratio_setting.USD2RMB}},
		"wan2.6-t2v": {Unit: "video_second", Prices: map[string]float64{"720P": 0.6 / ratio_setting.USD2RMB, "1080P": 1 / ratio_setting.USD2RMB}},
		"wan2.6-i2v": {Unit: "video_second", Prices: map[string]float64{"720P": 0.6 / ratio_setting.USD2RMB, "1080P": 1 / ratio_setting.USD2RMB}},
		"wan2.5-t2v-preview": {Unit: "video_second", Prices: map[string]float64{"480P": 0.3 / ratio_setting.USD2RMB, "720P": 0.6 / ratio_setting.USD2RMB, "1080P": 1 / ratio_setting.USD2RMB}},
		"wan2.5-i2v-preview": {Unit: "video_second", Prices: map[string]float64{"480P": 0.3 / ratio_setting.USD2RMB, "720P": 0.6 / ratio_setting.USD2RMB, "1080P": 1 / ratio_setting.USD2RMB}},
		"wan2.2-t2v-plus": {Unit: "video_second", Prices: map[string]float64{"480P": 0.14 / ratio_setting.USD2RMB, "1080P": 0.7 / ratio_setting.USD2RMB}},
		"wan2.2-i2v-plus": {Unit: "video_second", Prices: map[string]float64{"480P": 0.14 / ratio_setting.USD2RMB, "1080P": 0.7 / ratio_setting.USD2RMB}},
		"wan2.2-i2v-flash": {Unit: "video_second", Prices: map[string]float64{"480P": 0.1 / ratio_setting.USD2RMB, "720P": 0.2 / ratio_setting.USD2RMB, "1080P": 0.48 / ratio_setting.USD2RMB}},
		"wan2.2-kf2v-flash": {Unit: "video_second", Prices: map[string]float64{"480P": 0.1 / ratio_setting.USD2RMB, "720P": 0.2 / ratio_setting.USD2RMB, "1080P": 0.48 / ratio_setting.USD2RMB}},
		"wanx2.1-t2v-turbo": {Unit: "video_second", Prices: map[string]float64{"480P": 0.24 / ratio_setting.USD2RMB, "720P": 0.24 / ratio_setting.USD2RMB}},
		"wanx2.1-t2v-plus": {Unit: "video_second", Prices: map[string]float64{"720P": 0.7 / ratio_setting.USD2RMB}},
		"wanx2.1-i2v-turbo": {Unit: "video_second", Prices: map[string]float64{"480P": 0.24 / ratio_setting.USD2RMB, "720P": 0.24 / ratio_setting.USD2RMB}},
		"wanx2.1-i2v-plus": {Unit: "video_second", Prices: map[string]float64{"720P": 0.7 / ratio_setting.USD2RMB}},
	},
	dashScopeNativePricingRegionIntl: {
		"cosyvoice-v3.5-plus": {Unit: "character", Price: 1.5 / ratio_setting.USD2RMB / 10000},
		"qwen-image-2.0":      {Unit: "image", Price: 0.256873 / ratio_setting.USD2RMB},
		"qwen-image-2.0-pro":  {Unit: "image", Price: 0.5 / ratio_setting.USD2RMB},
		"happyhorse-1.1-i2v": {
			Unit: "video_second",
			Prices: map[string]float64{
				"720P":  1.049188 / ratio_setting.USD2RMB,
				"1080P": 1.348956 / ratio_setting.USD2RMB,
			},
		},
	},
}

func dashScopeNativePricingRegionFromBaseURL(baseURL string) string {
	baseURL = strings.TrimSpace(baseURL)
	if baseURL == "" {
		return dashScopeNativePricingRegionDomestic
	}
	parsed, err := url.Parse(baseURL)
	host := strings.ToLower(baseURL)
	if err == nil && parsed.Hostname() != "" {
		host = strings.ToLower(parsed.Hostname())
	}
	if strings.Contains(host, "dashscope-us") ||
		strings.Contains(host, "dashscope-intl") ||
		strings.Contains(host, "ap-southeast-1") ||
		strings.Contains(host, "eu-central-1") ||
		strings.Contains(host, "us-virginia") ||
		strings.Contains(host, "international") ||
		strings.Contains(host, ".sg") ||
		strings.Contains(host, "-sg") {
		return dashScopeNativePricingRegionIntl
	}
	return dashScopeNativePricingRegionDomestic
}

func dashScopeNativeOfficialPricingForChannel(channel *model.Channel) map[string]billing_setting.DashScopeNativePricing {
	result := make(map[string]billing_setting.DashScopeNativePricing)
	if channel == nil {
		return result
	}
	region := dashScopeNativePricingRegionFromBaseURL(channel.GetBaseURL())
	catalogs := []map[string]billing_setting.DashScopeNativePricing{
		dashScopeNativeOfficialPricingCatalog[region],
		dashScopeNativeOfficialPricingCatalog[dashScopeNativePricingRegionDomestic],
	}
	for _, modelName := range channel.GetModels() {
		modelName = strings.TrimSpace(modelName)
		if modelName == "" {
			continue
		}
		for _, catalog := range catalogs {
			if catalog == nil {
				continue
			}
			if spec, ok := catalog[modelName]; ok {
				result[modelName] = spec
				break
			}
		}
	}
	return result
}

func dashScopeNativePricingValueMap(value any) map[string]any {
	switch typed := value.(type) {
	case map[string]billing_setting.DashScopeNativePricing:
		result := make(map[string]any, len(typed))
		for modelName, spec := range typed {
			result[modelName] = compactJSONSyncValue(spec)
		}
		return result
	case map[string]any:
		result := make(map[string]any, len(typed))
		for modelName, spec := range typed {
			result[modelName] = compactJSONSyncValue(spec)
		}
		return result
	default:
		return nil
	}
}

func valueMapForSyncField(field string, value any) map[string]any {
	if field == billing_setting.DashScopeNativePricingField {
		return dashScopeNativePricingValueMap(value)
	}
	return valueMap(value)
}

func convertDashScopeNativeOfficialPricingData(channel *model.Channel) (map[string]any, error) {
	if channel == nil {
		return nil, fmt.Errorf("DashScope Native price sync requires a saved channel")
	}
	modelNames := channel.GetModels()
	if len(modelNames) == 0 {
		return nil, fmt.Errorf("DashScope Native channel has no models to sync")
	}
	billingModeMap := make(map[string]any)
	nativePricingMap := make(map[string]any)
	officialPricing := dashScopeNativeOfficialPricingForChannel(channel)
	missingModels := make([]string, 0)
	for _, modelName := range modelNames {
		modelName = strings.TrimSpace(modelName)
		if modelName == "" {
			continue
		}
		spec, ok := officialPricing[modelName]
		if !ok {
			missingModels = append(missingModels, modelName)
			continue
		}
		billingModeMap[modelName] = billing_setting.BillingModeDashScopeNative
		nativePricingMap[modelName] = compactJSONSyncValue(spec)
	}
	if len(missingModels) > 0 {
		return nil, fmt.Errorf("missing built-in DashScope Native official prices for model(s): %s", strings.Join(missingModels, ", "))
	}
	if len(nativePricingMap) == 0 {
		return nil, fmt.Errorf("no built-in DashScope Native official prices matched this channel's models")
	}
	return map[string]any{
		billing_setting.BillingModeField:            billingModeMap,
		billing_setting.DashScopeNativePricingField: nativePricingMap,
	}, nil
}

''',
        "convertDashScopeNativeOfficialPricingData",
        "DashScope Native official pricing helpers",
    )

    if dto_has_type:
        replace_once(
            "controller/ratio_sync.go",
            '''\t\t\t\tupstreams = append(upstreams, dto.UpstreamDTO{
\t\t\t\t\tID:       ch.Id,
\t\t\t\t\tName:     ch.Name,
\t\t\t\t\tBaseURL:  strings.TrimRight(base, "/"),
\t\t\t\t\tEndpoint: "",
\t\t\t\t})
''',
            '''\t\t\t\tupstreams = append(upstreams, dto.UpstreamDTO{
\t\t\t\t\tID:       ch.Id,
\t\t\t\t\tName:     ch.Name,
\t\t\t\t\tBaseURL:  strings.TrimRight(base, "/"),
\t\t\t\t\tEndpoint: "",
\t\t\t\t\tType:     ch.Type,
\t\t\t\t})
''',
            "syncable upstream channel type",
        )

    text = read("controller/ratio_sync.go")
    if "isDashScopeNativePricing :=" not in text:
        if '''\t\t\tisOpenRouter := chItem.Endpoint == "openrouter"

\t\t\tendpoint := chItem.Endpoint
''' in text:
            text = text.replace(
                '''\t\t\tisOpenRouter := chItem.Endpoint == "openrouter"

\t\t\tendpoint := chItem.Endpoint
''',
                '''\t\t\tisOpenRouter := chItem.Endpoint == "openrouter"
\t\t\tisDashScopeNativePricing := chItem.Endpoint == "dashscope_native" || chItem.Type == constant.ChannelTypeAliDashScopeNative

\t\t\tendpoint := chItem.Endpoint
''',
                1,
            )
        else:
            text, count = re.subn(
                r'(\n\s*isOpenRouter := chItem\.Endpoint == "openrouter"\n)',
                r'\1			isDashScopeNativePricing := chItem.Endpoint == "dashscope_native" || chItem.Type == constant.ChannelTypeAliDashScopeNative\n',
                text,
                count=1,
            )
            if count != 1:
                raise SystemExit("DashScope Native price sync patch failed: DashScope Native pricing detector anchor not found in controller/ratio_sync.go")
        write("controller/ratio_sync.go", text)

    insert_after(
        "controller/ratio_sync.go",
        '''\t\t\tif chItem.ID != 0 {
\t\t\t\tuniqueName = fmt.Sprintf("%s(%d)", chItem.Name, chItem.ID)
\t\t\t}
''',
        '''\n\t\t\tif isDashScopeNativePricing {
\t\t\t\tif chItem.ID == 0 {
\t\t\t\t\tch <- upstreamResult{Name: uniqueName, Err: "DashScope Native price sync requires a saved channel"}
\t\t\t\t\treturn
\t\t\t\t}
\t\t\t\tdbCh, err := model.GetChannelById(chItem.ID, true)
\t\t\t\tif err != nil {
\t\t\t\t\tch <- upstreamResult{Name: uniqueName, Err: "failed to get DashScope Native channel: " + err.Error()}
\t\t\t\t\treturn
\t\t\t\t}
\t\t\t\tconverted, err := convertDashScopeNativeOfficialPricingData(dbCh)
\t\t\t\tif err != nil {
\t\t\t\t\tch <- upstreamResult{Name: uniqueName, Err: err.Error()}
\t\t\t\t\treturn
\t\t\t\t}
\t\t\t\tch <- upstreamResult{Name: uniqueName, Data: converted}
\t\t\t\treturn
\t\t\t}
''',
        "convertDashScopeNativeOfficialPricingData(dbCh)",
        "DashScope Native pricing branch",
    )

    replacements = [
        ("for modelName := range valueMap(localData[field]) {", "for modelName := range valueMapForSyncField(field, localData[field]) {"),
        ("for modelName := range valueMap(channel.data[field]) {", "for modelName := range valueMapForSyncField(field, channel.data[field]) {"),
        ("if val, exists := valueMap(localData[ratioType])[modelName]; exists {", "if val, exists := valueMapForSyncField(ratioType, localData[ratioType])[modelName]; exists {"),
        ("if val, exists := valueMap(channel.data[ratioType])[modelName]; exists {", "if val, exists := valueMapForSyncField(ratioType, channel.data[ratioType])[modelName]; exists {"),
    ]
    text = read("controller/ratio_sync.go")
    for old, new in replacements:
        if new not in text:
            if old not in text:
                raise SystemExit(f"DashScope Native price sync patch failed: missing valueMap anchor {old}")
            text = text.replace(old, new, 1)
    write("controller/ratio_sync.go", text)


def patch_existing_pricing_catalog_file() -> None:
    rel = "controller/dashscope_native_pricing_catalog.go"
    if not (ROOT / rel).exists():
        return
    text = read(rel)
    if '"cosyvoice-v3.5-flash"' not in text:
        text = text.replace(
            '\t\t"cosyvoice-v3.5-plus": {Unit: "character", Price: 1.5 / ratio_setting.USD2RMB / 10000},\n',
            '\t\t"cosyvoice-v3.5-plus":  {Unit: "character", Price: 1.5 / ratio_setting.USD2RMB / 10000},\n'
            '\t\t"cosyvoice-v3.5-flash": {Unit: "character", Price: 0.8 / ratio_setting.USD2RMB / 10000},\n',
            1,
        )
    additions = {
        '"qwen-image-2.0-2026-03-03"': '\t\t"qwen-image-2.0-2026-03-03": {Unit: "image", Price: 0.2 / ratio_setting.USD2RMB},\n',
        '"qwen-image-2.0-pro"': (
            '\t\t"qwen-image-2.0-pro":            {Unit: "image", Price: 0.5 / ratio_setting.USD2RMB},\n'
            '\t\t"qwen-image-2.0-pro-2026-06-22": {Unit: "image", Price: 0.5 / ratio_setting.USD2RMB},\n'
            '\t\t"qwen-image-2.0-pro-2026-04-22": {Unit: "image", Price: 0.5 / ratio_setting.USD2RMB},\n'
            '\t\t"qwen-image-2.0-pro-2026-03-03": {Unit: "image", Price: 0.5 / ratio_setting.USD2RMB},\n'
        ),
    }
    qwen_anchor = '\t\t"qwen-image-2.0":      {Unit: "image", Price: 0.2 / ratio_setting.USD2RMB},\n'
    for marker, snippet in additions.items():
        if marker not in text and qwen_anchor in text:
            text = text.replace(qwen_anchor, qwen_anchor + snippet, 1)
    if '"happyhorse-1.1-t2v"' not in text:
        text = text.replace(
            '\t\t"happyhorse-1.1-i2v": {\n',
            '\t\t"happyhorse-1.1-t2v": {\n'
            '\t\t\tUnit: "video_second",\n'
            '\t\t\tPrices: map[string]float64{\n'
            '\t\t\t\t"480P":  0.45 / ratio_setting.USD2RMB,\n'
            '\t\t\t\t"720P":  0.9 / ratio_setting.USD2RMB,\n'
            '\t\t\t\t"1080P": 1.2 / ratio_setting.USD2RMB,\n'
            '\t\t\t},\n'
            '\t\t},\n'
            '\t\t"happyhorse-1.1-i2v": {\n',
            1,
        )
    if '"happyhorse-1.1-i2v": {\n\t\t\tUnit: "video_second",\n\t\t\tPrices: map[string]float64{\n\t\t\t\t"720P":' in text:
        text = text.replace(
            '"happyhorse-1.1-i2v": {\n\t\t\tUnit: "video_second",\n\t\t\tPrices: map[string]float64{\n\t\t\t\t"720P":',
            '"happyhorse-1.1-i2v": {\n\t\t\tUnit: "video_second",\n\t\t\tPrices: map[string]float64{\n\t\t\t\t"480P":  0.45 / ratio_setting.USD2RMB,\n\t\t\t\t"720P":',
            1,
        )
    if '"480P":  0.45 / ratio_setting.USD2RMB' in text and '"happyhorse-1.1-r2v"' not in text:
        extra_video = '''\t\t"happyhorse-1.1-r2v": {
\t\t\tUnit: "video_second",
\t\t\tPrices: map[string]float64{
\t\t\t\t"480P":  0.45 / ratio_setting.USD2RMB,
\t\t\t\t"720P":  0.9 / ratio_setting.USD2RMB,
\t\t\t\t"1080P": 1.2 / ratio_setting.USD2RMB,
\t\t\t},
\t\t},
\t\t"happyhorse-1.0-t2v": {
\t\t\tUnit: "video_second",
\t\t\tPrices: map[string]float64{
\t\t\t\t"720P":  0.9 / ratio_setting.USD2RMB,
\t\t\t\t"1080P": 1.6 / ratio_setting.USD2RMB,
\t\t\t},
\t\t},
\t\t"happyhorse-1.0-i2v": {
\t\t\tUnit: "video_second",
\t\t\tPrices: map[string]float64{
\t\t\t\t"720P":  0.9 / ratio_setting.USD2RMB,
\t\t\t\t"1080P": 1.6 / ratio_setting.USD2RMB,
\t\t\t},
\t\t},
\t\t"happyhorse-1.0-r2v": {
\t\t\tUnit: "video_second",
\t\t\tPrices: map[string]float64{
\t\t\t\t"720P":  0.9 / ratio_setting.USD2RMB,
\t\t\t\t"1080P": 1.6 / ratio_setting.USD2RMB,
\t\t\t},
\t\t},
\t\t"happyhorse-1.0-video-edit": {
\t\t\tUnit: "video_second",
\t\t\tPrices: map[string]float64{
\t\t\t\t"720P":  0.9 / ratio_setting.USD2RMB,
\t\t\t\t"1080P": 1.6 / ratio_setting.USD2RMB,
\t\t\t},
\t\t},
\t\t"wan2.7-t2v":            {Unit: "video_second", Prices: map[string]float64{"720P": 0.6 / ratio_setting.USD2RMB, "1080P": 1 / ratio_setting.USD2RMB}},
\t\t"wan2.7-t2v-2026-06-12": {Unit: "video_second", Prices: map[string]float64{"720P": 0.6 / ratio_setting.USD2RMB, "1080P": 1 / ratio_setting.USD2RMB}},
\t\t"wan2.7-t2v-2026-04-25": {Unit: "video_second", Prices: map[string]float64{"720P": 0.6 / ratio_setting.USD2RMB, "1080P": 1 / ratio_setting.USD2RMB}},
\t\t"wan2.7-i2v":            {Unit: "video_second", Prices: map[string]float64{"720P": 0.6 / ratio_setting.USD2RMB, "1080P": 1 / ratio_setting.USD2RMB}},
\t\t"wan2.7-i2v-2026-04-25": {Unit: "video_second", Prices: map[string]float64{"720P": 0.6 / ratio_setting.USD2RMB, "1080P": 1 / ratio_setting.USD2RMB}},
\t\t"wan2.6-t2v":            {Unit: "video_second", Prices: map[string]float64{"720P": 0.6 / ratio_setting.USD2RMB, "1080P": 1 / ratio_setting.USD2RMB}},
\t\t"wan2.6-i2v":            {Unit: "video_second", Prices: map[string]float64{"720P": 0.6 / ratio_setting.USD2RMB, "1080P": 1 / ratio_setting.USD2RMB}},
\t\t"wan2.5-t2v-preview":    {Unit: "video_second", Prices: map[string]float64{"480P": 0.3 / ratio_setting.USD2RMB, "720P": 0.6 / ratio_setting.USD2RMB, "1080P": 1 / ratio_setting.USD2RMB}},
\t\t"wan2.5-i2v-preview":    {Unit: "video_second", Prices: map[string]float64{"480P": 0.3 / ratio_setting.USD2RMB, "720P": 0.6 / ratio_setting.USD2RMB, "1080P": 1 / ratio_setting.USD2RMB}},
\t\t"wan2.2-t2v-plus":       {Unit: "video_second", Prices: map[string]float64{"480P": 0.14 / ratio_setting.USD2RMB, "1080P": 0.7 / ratio_setting.USD2RMB}},
\t\t"wan2.2-i2v-plus":       {Unit: "video_second", Prices: map[string]float64{"480P": 0.14 / ratio_setting.USD2RMB, "1080P": 0.7 / ratio_setting.USD2RMB}},
\t\t"wan2.2-i2v-flash":      {Unit: "video_second", Prices: map[string]float64{"480P": 0.1 / ratio_setting.USD2RMB, "720P": 0.2 / ratio_setting.USD2RMB, "1080P": 0.48 / ratio_setting.USD2RMB}},
\t\t"wan2.2-kf2v-flash":     {Unit: "video_second", Prices: map[string]float64{"480P": 0.1 / ratio_setting.USD2RMB, "720P": 0.2 / ratio_setting.USD2RMB, "1080P": 0.48 / ratio_setting.USD2RMB}},
\t\t"wanx2.1-t2v-turbo":     {Unit: "video_second", Prices: map[string]float64{"480P": 0.24 / ratio_setting.USD2RMB, "720P": 0.24 / ratio_setting.USD2RMB}},
\t\t"wanx2.1-t2v-plus":      {Unit: "video_second", Prices: map[string]float64{"720P": 0.7 / ratio_setting.USD2RMB}},
\t\t"wanx2.1-i2v-turbo":     {Unit: "video_second", Prices: map[string]float64{"480P": 0.24 / ratio_setting.USD2RMB, "720P": 0.24 / ratio_setting.USD2RMB}},
\t\t"wanx2.1-i2v-plus":      {Unit: "video_second", Prices: map[string]float64{"720P": 0.7 / ratio_setting.USD2RMB}},
'''
        text = text.replace("\t},\n\tdashScopeNativePricingRegionIntl: {", extra_video + "\t},\n\tdashScopeNativePricingRegionIntl: {", 1)
    if '"qwen-image-2.0-pro"' not in text.split("dashScopeNativePricingRegionIntl:", 1)[-1]:
        intl_anchor = '\t\t"qwen-image-2.0":      {Unit: "image", Price: 0.256873 / ratio_setting.USD2RMB},\n'
        if intl_anchor in text:
            text = text.replace(intl_anchor, intl_anchor + '\t\t"qwen-image-2.0-pro":  {Unit: "image", Price: 0.5 / ratio_setting.USD2RMB},\n', 1)
    write(rel, text)


def patch_price_helper() -> None:
    rel = "relay/helper/price.go"
    text = read(rel)
    if '"github.com/QuantumNous/new-api/constant"' not in text:
        anchor = '\t"github.com/QuantumNous/new-api/common"\n'
        if anchor not in text:
            raise SystemExit("DashScope Native price sync patch failed: price helper common import anchor not found")
        text = text.replace(
            anchor,
            anchor + '\t"github.com/QuantumNous/new-api/constant"\n',
            1,
        )
    old = '''\tif billingMode == billing_setting.BillingModeDashScopeNative {
\t\treturn types.PriceData{}, fmt.Errorf("model %s uses dashscope_native billing and can only be billed through Ali SDK / DashScope Native native routes", info.OriginModelName)
\t}
'''
    new = '''\tif billingMode == billing_setting.BillingModeDashScopeNative {
\t\tif info.ChannelType != constant.ChannelTypeAliDashScopeNative || !info.IsChannelTest {
\t\t\treturn types.PriceData{}, fmt.Errorf("model %s uses dashscope_native billing and can only be billed through Ali SDK / DashScope Native native routes", info.OriginModelName)
\t\t}
\t\treturn modelPriceHelperDashScopeNative(info, groupRatioInfo)
\t}
'''
    if new not in text:
        if old not in text:
            raise SystemExit("DashScope Native price sync patch failed: price helper native billing anchor not found")
        text = text.replace(old, new, 1)
    if "func modelPriceHelperDashScopeNative(" not in text:
        anchor = "\n// ModelPriceHelperPerCall 按次/按量计费的 PriceHelper (MJ、Task)\n"
        helper = r'''
func modelPriceHelperDashScopeNative(info *relaycommon.RelayInfo, groupRatioInfo types.GroupRatioInfo) (types.PriceData, error) {
	spec, ok := billing_setting.GetDashScopeNativePricing(info.OriginModelName)
	if !ok {
		return types.PriceData{}, modelPriceNotConfiguredError(info.OriginModelName, info.UserId)
	}

	referencePrice := spec.Price
	if spec.Unit == "token_input_output" {
		referencePrice = maxFloat64(spec.InputPrice, spec.OutputPrice, spec.CacheReadPrice, spec.CacheWritePrice)
	}
	if referencePrice <= 0 {
		for _, price := range spec.Prices {
			if price > 0 {
				referencePrice = price
				break
			}
		}
	}
	if referencePrice <= 0 {
		return types.PriceData{}, fmt.Errorf("DashScope Native price is not configured for model %q", info.OriginModelName)
	}

	priceData := types.PriceData{
		ModelPrice:     referencePrice,
		UsePrice:       true,
		GroupRatioInfo: groupRatioInfo,
	}
	info.PriceData = priceData
	return priceData, nil
}

func maxFloat64(values ...float64) float64 {
	result := 0.0
	for _, value := range values {
		if value > result {
			result = value
		}
	}
	return result
}

'''
        if anchor not in text:
            raise SystemExit("DashScope Native price sync patch failed: price helper insertion anchor not found")
        text = text.replace(anchor, "\n" + helper + anchor, 1)
    write(rel, text)


def patch_billing_setting() -> None:
    rel = "setting/billing_setting/tiered_billing.go"
    text = read(rel)
    if "BillingModeDashScopeNative" not in text:
        anchor = '\tBillingModeTieredExpr       = "tiered_expr"\n'
        if anchor not in text:
            raise SystemExit("DashScope Native price sync patch failed: BillingModeTieredExpr anchor not found")
        text = text.replace(anchor, anchor + '\tBillingModeDashScopeNative  = "dashscope_native"\n', 1)
    if "CacheReadPrice" not in text and "type DashScopeNativePricing struct" in text:
        anchor = '\tOutputPrice float64            `json:"output_price,omitempty"`\n'
        if anchor not in text:
            raise SystemExit("DashScope Native price sync patch failed: DashScopeNativePricing OutputPrice anchor not found")
        text = text.replace(
            anchor,
            anchor
            + '\tCacheReadPrice  float64            `json:"cache_read_price,omitempty"`\n'
            + '\tCacheWritePrice float64            `json:"cache_write_price,omitempty"`\n',
            1,
        )
    write(rel, text)


def main() -> None:
    dto_has_type = patch_dto()
    patch_ratio_sync(dto_has_type)
    patch_price_helper()
    print("applied DashScope Native price sync backend patch")


if __name__ == "__main__":
    main()
