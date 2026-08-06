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
		"cosyvoice-v3.5-plus": {Unit: "character", Price: 1.5 / ratio_setting.USD2RMB},
		"cosyvoice-v3.5-flash": {Unit: "character", Price: 0.8 / ratio_setting.USD2RMB},
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
		"cosyvoice-v3.5-plus": {Unit: "character", Price: 1.5 / ratio_setting.USD2RMB},
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
            '\t\t"cosyvoice-v3.5-plus": {Unit: "character", Price: 1.5 / ratio_setting.USD2RMB},\n',
            '\t\t"cosyvoice-v3.5-plus":  {Unit: "character", Price: 1.5 / ratio_setting.USD2RMB},\n'
            '\t\t"cosyvoice-v3.5-flash": {Unit: "character", Price: 0.8 / ratio_setting.USD2RMB},\n',
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
    required_imports = [
        '"github.com/QuantumNous/new-api/setting/billing_setting"',
    ]
    missing_imports = [item for item in required_imports if item not in text]
    if missing_imports:
        import_match = re.search(r'import\s*\(\s*\n', text)
        if import_match:
            text = text[:import_match.end()] + "".join(f"\t{item}\n" for item in missing_imports) + text[import_match.end():]
        else:
            single_import_match = re.search(r'import\s+([^\n]+)\n', text)
            if not single_import_match:
                raise SystemExit("DashScope Native price sync patch failed: price helper import block not found")
            existing_import = single_import_match.group(1).strip()
            import_block = "import (\n\t" + existing_import + "\n" + "".join(f"\t{item}\n" for item in missing_imports) + ")\n"
            text = text[:single_import_match.start()] + import_block + text[single_import_match.end():]

    price_data_type = "types.PriceData"
    price_data_match = re.search(r'func\s+ModelPriceHelper\s*\([^)]*\)\s*\(([^,]+),\s*error\)', text)
    if price_data_match:
        price_data_type = price_data_match.group(1).strip()
    group_ratio_type = "types.GroupRatioInfo"
    group_ratio_match = re.search(r'func\s+HandleGroupRatio\s*\([^)]*\)\s*([^\s{]+)\s*\{', text)
    if group_ratio_match:
        group_ratio_type = group_ratio_match.group(1).strip()

    # This hook only syncs DashScope Native pricing structures/helpers. Normal
    # relay routing is owned by ali-video-audio-endpoints.py, where channel meta
    # can be read safely. Do not insert a ModelPriceHelper entry branch here:
    # direct info.ChannelType access panics before RelayInfo.InitChannelMeta().
    text = re.sub(
        r'\n\tif billing_setting\.GetBillingMode\(info\.OriginModelName\) == billing_setting\.BillingModeDashScopeNative \{\n'
        r'\t\tgroupRatioInfo := HandleGroupRatio\(c, info\)\n'
        r'\t\tif info\.ChannelType != constant\.ChannelTypeAliDashScopeNative(?: \|\| !info\.IsChannelTest)? \{\n'
        r'\t\t\treturn [^{}]+(?:\{\})?, fmt\.Errorf\("model %s uses dashscope_native billing and can only be billed through Ali SDK / DashScope Native native routes", info\.OriginModelName\)\n'
        r'\t\t\}\n'
        r'\t\treturn modelPriceHelperDashScopeNative\(info, groupRatioInfo\)\n'
        r'\t\}\n',
        "\n",
        text,
        count=1,
    )
    if "func modelPriceHelperDashScopeNative(" not in text:
        helper = r'''
func modelPriceHelperDashScopeNative(info *relaycommon.RelayInfo, groupRatioInfo __GROUP_RATIO_TYPE__) (__PRICE_DATA_TYPE__, error) {
	spec, ok := billing_setting.GetDashScopeNativePricing(info.OriginModelName)
	if !ok {
		return __PRICE_DATA_TYPE__{}, modelPriceNotConfiguredError(info.OriginModelName, info.UserId)
	}

	referencePrice := spec.Price
	if spec.Unit == "token_input_output" {
		referencePrice = dashScopeNativeMaxFloat64(spec.InputPrice, spec.OutputPrice, spec.CacheReadPrice, spec.CacheWritePrice)
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
		return __PRICE_DATA_TYPE__{}, fmt.Errorf("DashScope Native price is not configured for model %q", info.OriginModelName)
	}

	priceData := __PRICE_DATA_TYPE__{
		ModelPrice:     referencePrice,
		UsePrice:       true,
		GroupRatioInfo: groupRatioInfo,
	}
	info.PriceData = priceData
	return priceData, nil
}

func dashScopeNativeMaxFloat64(values ...float64) float64 {
	result := 0.0
	for _, value := range values {
		if value > result {
			result = value
		}
	}
	return result
}

'''.replace("__PRICE_DATA_TYPE__", price_data_type).replace("__GROUP_RATIO_TYPE__", group_ratio_type)
        text = text.rstrip() + "\n\n" + helper.lstrip()
    write(rel, text)


def patch_billing_setting() -> None:
    rel = "setting/billing_setting/tiered_billing.go"
    text = read(rel)
    if '"strings"' not in text:
        text = text.replace('\t"fmt"\n', '\t"fmt"\n\t"strings"\n', 1)
    if "BillingModeDashScopeNative" not in text:
        text, count = re.subn(
            r'(\tBillingModeTieredExpr\s*=\s*"tiered_expr"\n)',
            r'\1\tBillingModeDashScopeNative  = "dashscope_native"\n',
            text,
            count=1,
        )
        if count != 1:
            raise SystemExit("DashScope Native price sync patch failed: BillingModeTieredExpr anchor not found")
    if "CacheReadPrice" not in text and "type DashScopeNativePricing struct" in text:
        text, count = re.subn(
            r'(\tOutputPrice\s+float64\s+`json:"output_price,omitempty"`\n)',
            r'\1\tCacheReadPrice  float64            `json:"cache_read_price,omitempty"`\n\tCacheWritePrice float64            `json:"cache_write_price,omitempty"`\n',
            text,
            count=1,
        )
        if count != 1:
            raise SystemExit("DashScope Native price sync patch failed: DashScopeNativePricing OutputPrice anchor not found")
    if "func DashScopeNativeCharacterUnitDivisor(" not in text:
        helper = '''
func DashScopeNativeCharacterUnitDivisor(unit string) float64 {
\tswitch strings.TrimSpace(unit) {
\tcase "character", "character_10k":
\t\treturn 10000
\tdefault:
\t\treturn 0
\t}
}

func IsDashScopeNativeCharacterUnit(unit string) bool {
\treturn DashScopeNativeCharacterUnitDivisor(unit) > 0
}

func DashScopeNativeCharacterQuantity(unit string, characters int) float64 {
\tif characters <= 0 {
\t\treturn 0
\t}
\tdivisor := DashScopeNativeCharacterUnitDivisor(unit)
\tif divisor <= 0 {
\t\treturn 0
\t}
\treturn float64(characters) / divisor
}

'''
        anchor = "func init() {\n"
        if anchor not in text:
            raise SystemExit("DashScope Native price sync patch failed: billing init anchor not found")
        text = text.replace(anchor, helper + anchor, 1)
    write(rel, text)


def main() -> None:
    dto_has_type = patch_dto()
    patch_ratio_sync(dto_has_type)
    patch_price_helper()
    print("applied DashScope Native price sync backend patch v4-flex-imports")


if __name__ == "__main__":
    main()
