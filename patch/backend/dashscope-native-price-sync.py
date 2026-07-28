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
    preferred = ROOT / "dto" / "ratio_sync.go"
    if preferred.exists():
        return "dto/ratio_sync.go"
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
        rel = "dto/ratio_sync.go"
        path = ROOT / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            '''package dto

type UpstreamDTO struct {
\tID       int    `json:"id,omitempty"`
\tName     string `json:"name" binding:"required"`
\tBaseURL  string `json:"base_url" binding:"required"`
\tEndpoint string `json:"endpoint"`
\tType     int    `json:"type,omitempty"`
}

type UpstreamRequest struct {
\tChannelIDs []int64       `json:"channel_ids"`
\tUpstreams  []UpstreamDTO `json:"upstreams"`
\tTimeout    int           `json:"timeout"`
}

type TestResult struct {
\tName   string `json:"name"`
\tStatus string `json:"status"`
\tError  string `json:"error,omitempty"`
}

type DifferenceItem struct {
\tCurrent    interface{}            `json:"current"`
\tUpstreams  map[string]interface{} `json:"upstreams"`
\tConfidence map[string]bool        `json:"confidence"`
}

type SyncableChannel struct {
\tID      int    `json:"id"`
\tName    string `json:"name"`
\tBaseURL string `json:"base_url"`
\tStatus  int    `json:"status"`
\tType    int    `json:"type"`
}
''',
            encoding="utf-8",
        )
        return True
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
    text = read("controller/ratio_sync.go")
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
		if err := json.Unmarshal([]byte(text), &raw); err == nil {
			if compact, err := json.Marshal(raw); err == nil {
				return string(compact)
			}
		}
		return strings.TrimSpace(text)
	}
	compact, err := json.Marshal(value)
	if err != nil {
		return fmt.Sprintf("%v", value)
	}
	return string(compact)
}

var dashScopeNativeOfficialPricing = map[string]billing_setting.DashScopeNativePricing{
	// Official unit is USD per 10,000 input characters; native billing stores
	// USD per character so settlement can multiply by the exact text length.
	"cosyvoice-v3.5-plus": {Unit: "character", Price: 0.000022},
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
	nativePricingMap := make(map[string]any)
	for _, modelName := range modelNames {
		modelName = strings.TrimSpace(modelName)
		if modelName == "" {
			continue
		}
		spec, ok := dashScopeNativeOfficialPricing[modelName]
		if !ok {
			continue
		}
		nativePricingMap[modelName] = compactJSONSyncValue(spec)
	}
	if len(nativePricingMap) == 0 {
		return nil, fmt.Errorf("no built-in DashScope Native official prices matched this channel's models")
	}
	return map[string]any{
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
\t\t\tisDashScopeNativePricing := chItem.Endpoint == "dashscope_native"

\t\t\tendpoint := chItem.Endpoint
''',
                1,
            )
        else:
            text, count = re.subn(
                r'(\n\s*isOpenRouter := chItem\.Endpoint == "openrouter"\n)',
                r'\1			isDashScopeNativePricing := chItem.Endpoint == "dashscope_native"\n',
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


def main() -> None:
    dto_has_type = patch_dto()
    patch_ratio_sync(dto_has_type)
    print("applied DashScope Native price sync backend patch")


if __name__ == "__main__":
    main()
