#!/usr/bin/env python3
from pathlib import Path
import re
import sys


ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else ".")


def read(rel: str) -> str:
    path = ROOT / rel
    if not path.exists():
        raise SystemExit(f"Ali video/audio endpoint patch failed: missing {rel}")
    return path.read_text(encoding="utf-8")


def write(rel: str, text: str) -> None:
    (ROOT / rel).write_text(text, encoding="utf-8")


def ensure_after(text: str, anchor: str, snippet: str, label: str) -> str:
    if snippet.strip() in text:
        return text
    if anchor not in text:
        raise SystemExit(f"Ali video/audio endpoint patch failed: {label} anchor not found")
    return text.replace(anchor, anchor + snippet, 1)


def ensure_after_regex(text: str, pattern: str, snippet: str, label: str) -> str:
    if snippet.strip() in text:
        return text
    match = re.search(pattern, text, flags=re.MULTILINE)
    if not match:
        raise SystemExit(f"Ali video/audio endpoint patch failed: {label} anchor not found")
    return text[: match.end()] + snippet + text[match.end() :]


def insert_before_regex(text: str, pattern: str, snippet: str, label: str) -> str:
    if snippet.strip() in text:
        return text
    match = re.search(pattern, text, flags=re.MULTILINE)
    if not match:
        raise SystemExit(f"Ali video/audio endpoint patch failed: {label} anchor not found")
    return text[: match.start()] + snippet + text[match.start() :]


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Ali video/audio endpoint patch failed: {label} anchor not found")
    return text.replace(old, new, 1)


def replace_once_regex(text: str, pattern: str, repl: str, label: str) -> str:
    new_text, count = re.subn(pattern, repl, text, count=1, flags=re.MULTILINE)
    if count == 0:
        raise SystemExit(f"Ali video/audio endpoint patch failed: {label} anchor not found")
    return new_text


def patch_safe_proxy_request_helper(text: str) -> str:
    if "info != nil && info.ChannelMeta != nil" in text:
        return text

    old = '''	var client *http.Client
	var err error
	if info.ChannelSetting.Proxy != "" {
		client, err = service.GetHttpClientWithProxy(info.ChannelSetting.Proxy)
		if err != nil {
			return nil, fmt.Errorf("new proxy http client failed: %w", err)
		}
	} else {
		client = service.GetHttpClient()
	}
'''
    new = '''	var client *http.Client
	var err error
	proxy := ""
	if info != nil && info.ChannelMeta != nil {
		proxy = info.ChannelSetting.Proxy
	}
	if proxy != "" {
		client, err = service.GetHttpClientWithProxy(proxy)
		if err != nil {
			return nil, fmt.Errorf("new proxy http client failed: %w", err)
		}
	} else {
		client = service.GetHttpClient()
	}
'''
    if old in text:
        return text.replace(old, new, 1)

    pattern = (
        r'(\nfunc doRequest\(c \*gin\.Context, req \*http\.Request, info \*common\.RelayInfo\) '
        r'\(\*http\.Response, error\) \{\n\s*var client \*http\.Client\n\s*var err error\n)'
        r'\s*if info\.ChannelSetting\.Proxy != "" \{\n'
        r'\s*client, err = service\.GetHttpClientWithProxy\(info\.ChannelSetting\.Proxy\)\n'
        r'\s*if err != nil \{\n'
        r'\s*return nil, fmt\.Errorf\("new proxy http client failed: %w", err\)\n'
        r'\s*\}\n'
        r'\s*\} else \{\n'
        r'\s*client = service\.GetHttpClient\(\)\n'
        r'\s*\}\n'
    )
    replacement = r'\1' + '''	proxy := ""
	if info != nil && info.ChannelMeta != nil {
		proxy = info.ChannelSetting.Proxy
	}
	if proxy != "" {
		client, err = service.GetHttpClientWithProxy(proxy)
		if err != nil {
			return nil, fmt.Errorf("new proxy http client failed: %w", err)
		}
	} else {
		client = service.GetHttpClient()
	}
'''
    new_text, count = re.subn(pattern, replacement, text, count=1, flags=re.MULTILINE)
    if count == 0:
        print("skip safe proxy lookup patch: request helper shape not recognized")
        return text
    return new_text


def has_endpoint_type_const(text: str, name: str, value: str) -> bool:
    pattern = rf'^\s*{re.escape(name)}\s+EndpointType\s*=\s*"{re.escape(value)}"\s*$'
    return re.search(pattern, text, flags=re.MULTILINE) is not None


def has_endpoint_type_alias(text: str, name: str) -> bool:
    pattern = rf'^\s*{re.escape(name)}\s*=\s*types\.{re.escape(name)}\s*$'
    return re.search(pattern, text, flags=re.MULTILINE) is not None


def has_endpoint_default(text: str, name: str) -> bool:
    pattern = rf'^\s*constant\.{re.escape(name)}\s*:'
    return re.search(pattern, text, flags=re.MULTILINE) is not None


def patch_endpoint_type_value_file(rel: str) -> None:
    path = ROOT / rel
    if not path.exists():
        return
    text = read(rel)
    has_video = has_endpoint_type_const(text, "EndpointTypeOpenAIVideo", "openai-video")
    has_audio = has_endpoint_type_const(text, "EndpointTypeAudioSpeech", "audio-speech")
    if not has_video:
        snippet = '\tEndpointTypeOpenAIVideo           EndpointType = "openai-video"\n'
        if not has_audio:
            snippet += '\tEndpointTypeAudioSpeech           EndpointType = "audio-speech"\n'
        embeddings_pattern = r'^\s*EndpointTypeEmbeddings\s+EndpointType\s*=\s*"embeddings"\s*\n'
        if re.search(embeddings_pattern, text, flags=re.MULTILINE):
            text = ensure_after_regex(text, embeddings_pattern, snippet, f"{rel} endpoint type embeddings")
        else:
            text = insert_before_regex(text, r'^\s*\)\s*$', snippet, f"{rel} endpoint type const block end")
    elif not has_audio:
        text = ensure_after_regex(
            text,
            r'^\s*EndpointTypeOpenAIVideo\s+EndpointType\s*=\s*"openai-video"\s*\n',
            '\tEndpointTypeAudioSpeech           EndpointType = "audio-speech"\n',
            f"{rel} audio endpoint type",
        )
    write(rel, text)


def patch_endpoint_type_alias_file(rel: str) -> None:
    text = read(rel)
    has_video = has_endpoint_type_alias(text, "EndpointTypeOpenAIVideo")
    has_audio = has_endpoint_type_alias(text, "EndpointTypeAudioSpeech")
    if not has_video:
        snippet = '\tEndpointTypeOpenAIVideo           = types.EndpointTypeOpenAIVideo\n'
        if not has_audio:
            snippet += '\tEndpointTypeAudioSpeech           = types.EndpointTypeAudioSpeech\n'
        embeddings_pattern = r'^\s*EndpointTypeEmbeddings\s*=\s*types\.EndpointTypeEmbeddings\s*\n'
        if re.search(embeddings_pattern, text, flags=re.MULTILINE):
            text = ensure_after_regex(text, embeddings_pattern, snippet, f"{rel} endpoint alias embeddings")
        else:
            text = insert_before_regex(text, r'^\s*\)\s*$', snippet, f"{rel} endpoint alias const block end")
    elif not has_audio:
        text = ensure_after_regex(
            text,
            r'^\s*EndpointTypeOpenAIVideo\s*=\s*types\.EndpointTypeOpenAIVideo\s*\n',
            '\tEndpointTypeAudioSpeech           = types.EndpointTypeAudioSpeech\n',
            f"{rel} audio endpoint alias",
        )
    write(rel, text)


def patch_endpoint_types() -> None:
    relaykit_rel = "relaykit/types/endpoint_type.go"
    patch_endpoint_type_value_file(relaykit_rel)

    rel = "constant/endpoint_type.go"
    text = read(rel)
    if "type EndpointType = types.EndpointType" in text:
        patch_endpoint_type_alias_file(rel)
    else:
        patch_endpoint_type_value_file(rel)


def patch_endpoint_defaults() -> None:
    rel = "common/endpoint_defaults.go"
    text = read(rel)
    has_video = has_endpoint_default(text, "EndpointTypeOpenAIVideo")
    has_audio = has_endpoint_default(text, "EndpointTypeAudioSpeech")
    if not has_video:
        snippet = '\tconstant.EndpointTypeOpenAIVideo:           {Path: "/v1/videos", Method: "POST"},\n'
        if not has_audio:
            snippet += '\tconstant.EndpointTypeAudioSpeech:           {Path: "/v1/audio/speech", Method: "POST"},\n'
        embeddings_pattern = r'^\s*constant\.EndpointTypeEmbeddings\s*:\s*\{Path:\s*"/v1/embeddings",\s*Method:\s*"POST"\},\s*\n'
        if re.search(embeddings_pattern, text, flags=re.MULTILINE):
            text = ensure_after_regex(text, embeddings_pattern, snippet, "endpoint defaults embeddings")
        else:
            text = insert_before_regex(text, r'^\s*\}\s*$', snippet, "endpoint defaults map end")
    elif not has_audio:
        text = ensure_after_regex(
            text,
            r'^\s*constant\.EndpointTypeOpenAIVideo\s*:\s*\{Path:\s*"/v1/videos",\s*Method:\s*"POST"\},\s*\n',
            '\tconstant.EndpointTypeAudioSpeech:           {Path: "/v1/audio/speech", Method: "POST"},\n',
            "audio endpoint defaults",
        )
    write(rel, text)


def patch_model_capabilities() -> None:
    rel = "common/model.go"
    text = read(rel)
    if "VideoGenerationModels = []string{" not in text:
        snippet = (
            '\tVideoGenerationModels = []string{\n'
            '\t\t"sora",\n\t\t"t2v",\n\t\t"i2v",\n\t\t"r2v",\n\t\t"kf2v",\n'
            '\t\t"video",\n\t\t"hailuo",\n\t\t"kling",\n\t\t"vidu",\n\t\t"happyhorse",\n\t\t"wan",\n\t}\n'
            '\tAudioSpeechModels = []string{\n\t\t"tts",\n\t\t"speech",\n\t\t"cosyvoice",\n\t\t"qwen-audio",\n\t}\n'
        )
        text_models_pattern = r'^\s*OpenAITextModels\s*=\s*\[\]string\s*\{(?:.|\n)*?^\s*\}\s*\n'
        if re.search(text_models_pattern, text, flags=re.MULTILINE):
            text = ensure_after_regex(text, text_models_pattern, snippet, "model capability lists")
        else:
            text = insert_before_regex(text, r'^\s*\)\s*$', snippet, "model capability var block end")
    if "func IsVideoGenerationModel(" not in text:
        text = text.rstrip() + '''

func IsVideoGenerationModel(modelName string) bool {
	modelName = strings.ToLower(strings.TrimSpace(modelName))
	if modelName == "" {
		return false
	}
	if strings.Contains(modelName, "t2i") {
		return false
	}
	for _, m := range VideoGenerationModels {
		if strings.Contains(modelName, m) {
			return true
		}
	}
	return false
}

func IsAudioSpeechModel(modelName string) bool {
	modelName = strings.ToLower(strings.TrimSpace(modelName))
	for _, m := range AudioSpeechModels {
		if strings.Contains(modelName, m) {
			return true
		}
	}
	return false
}
'''
    write(rel, text)

    rel = "common/endpoint_type.go"
    text = read(rel)
    if "IsVideoGenerationModel(modelName)" not in text:
        text = ensure_after_regex(
            text,
            r'^\s*if IsImageGenerationModel\(modelName\)\s*\{\n(?:.|\n)*?^\s*\}\s*\n',
            '\tif IsVideoGenerationModel(modelName) {\n\t\tendpointTypes = append([]constant.EndpointType{constant.EndpointTypeOpenAIVideo}, endpointTypes...)\n\t}\n'
            '\tif IsAudioSpeechModel(modelName) {\n\t\tendpointTypes = append([]constant.EndpointType{constant.EndpointTypeAudioSpeech}, endpointTypes...)\n\t}\n',
            "video/audio endpoint capability append",
        )
        write(rel, text)


def patch_advanced_custom_endpoints() -> None:
    for rel in ("dto/channel_settings.go", "relaykit/dto/channel_settings.go"):
        path = ROOT / rel
        if not path.exists():
            continue
        text = read(rel)
        endpoint_ref = "types" if "relaykit/types" in text or rel.startswith("relaykit/") else "constant"
        has_video = re.search(r'advancedCustomEndpointPathOpenAIVideo\s*=', text) is not None
        has_audio = re.search(r'advancedCustomEndpointPathAudioSpeech\s*=', text) is not None
        if not has_video:
            snippet = '\tadvancedCustomEndpointPathOpenAIVideo            = "/v1/videos"\n'
            if not has_audio:
                snippet += '\tadvancedCustomEndpointPathAudioSpeech            = "/v1/audio/speech"\n'
            const_anchor_patterns = (
                r'^\s*advancedCustomEndpointPathImageGenerationAsync\s*=\s*"/v1/image-tasks/generations"\s*\n',
                r'^\s*advancedCustomEndpointPathImageGeneration\s*=\s*"/v1/images/generations"\s*\n',
                r'^\s*advancedCustomEndpointPathEmbeddings\s*=\s*"/v1/embeddings"\s*\n',
            )
            for pattern in const_anchor_patterns:
                if re.search(pattern, text, flags=re.MULTILINE):
                    text = ensure_after_regex(text, pattern, snippet, f"{rel} video/audio advanced custom constant")
                    break
            else:
                text = insert_before_regex(text, r'^\s*\)\s*$', snippet, f"{rel} endpoint path const block end")
        elif not has_audio:
            video_const_pattern = r'^\s*advancedCustomEndpointPathOpenAIVideo\s*=\s*"/v1/videos"\s*\n'
            if re.search(video_const_pattern, text, flags=re.MULTILINE):
                text = ensure_after_regex(
                    text,
                    video_const_pattern,
                    '\tadvancedCustomEndpointPathAudioSpeech            = "/v1/audio/speech"\n',
                    f"{rel} audio advanced custom constant",
                )
            else:
                text = insert_before_regex(
                    text,
                    r'^\s*\)\s*$',
                    '\tadvancedCustomEndpointPathAudioSpeech            = "/v1/audio/speech"\n',
                    f"{rel} endpoint path const block end",
                )
        has_video_case = "case advancedCustomEndpointPathOpenAIVideo:" in text
        has_audio_case = "case advancedCustomEndpointPathAudioSpeech:" in text
        if not has_video_case and not has_audio_case:
            image_case_patterns = (
                r'(case advancedCustomEndpointPathImageGeneration,\s*advancedCustomEndpointPathImageGenerationAsync:\s*\n\s*return (?:constant|types)\.EndpointTypeImageGeneration,\s*true\s*\n)',
                r'(case advancedCustomEndpointPathImageGeneration:\s*\n\s*return (?:constant|types)\.EndpointTypeImageGeneration,\s*true\s*\n)',
            )
            for pattern in image_case_patterns:
                if re.search(pattern, text, flags=re.MULTILINE):
                    text = replace_once_regex(
                        text,
                        pattern,
                        r'\g<1>'
                        f"case advancedCustomEndpointPathOpenAIVideo:\n\t\treturn {endpoint_ref}.EndpointTypeOpenAIVideo, true\n"
                        f"case advancedCustomEndpointPathAudioSpeech:\n\t\treturn {endpoint_ref}.EndpointTypeAudioSpeech, true\n",
                        f"{rel} video/audio advanced custom switch",
                    )
                    break
            else:
                text = insert_before_regex(
                    text,
                    r'^\s*default:\s*\n',
                    f"case advancedCustomEndpointPathOpenAIVideo:\n\t\treturn {endpoint_ref}.EndpointTypeOpenAIVideo, true\n"
                    f"case advancedCustomEndpointPathAudioSpeech:\n\t\treturn {endpoint_ref}.EndpointTypeAudioSpeech, true\n",
                    f"{rel} advanced custom switch default",
                )
        elif not has_video_case:
            text = insert_before_regex(
                text,
                r'^\s*default:\s*\n',
                f"case advancedCustomEndpointPathOpenAIVideo:\n\t\treturn {endpoint_ref}.EndpointTypeOpenAIVideo, true\n",
                f"{rel} video advanced custom switch default",
            )
        elif not has_audio_case:
            text = ensure_after_regex(
                text,
                r'^\s*case advancedCustomEndpointPathOpenAIVideo:\s*\n\s*return (?:constant|types)\.EndpointTypeOpenAIVideo,\s*true\s*\n',
                f"case advancedCustomEndpointPathAudioSpeech:\n\t\treturn {endpoint_ref}.EndpointTypeAudioSpeech, true\n",
                f"{rel} audio advanced custom switch",
            )
        write(rel, text)


ALI_AUDIO_GO = r'''package ali

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/relay/channel/openai"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/billing_setting"
	"github.com/QuantumNous/new-api/types"

	"github.com/gin-gonic/gin"
)

const (
	defaultAliTTSFormat     = "mp3"
	defaultAliTTSSampleRate = 24000
	maxAliTTSAudioBytes     = 64 << 20
)

type aliTTSResponse struct {
	Output struct {
		AudioURL string `json:"audio_url"`
		URL      string `json:"url"`
		Data     string `json:"data"`
		Audio struct {
			URL  string `json:"url"`
			Data string `json:"data"`
		} `json:"audio"`
	} `json:"output"`
	Usage struct {
		Characters int `json:"characters"`
	} `json:"usage"`
	Code      string `json:"code"`
	Message   string `json:"message"`
	RequestID string `json:"request_id"`
}

func isAliQwen3TTSModel(modelName string) bool {
	normalized := strings.ToLower(strings.TrimSpace(modelName))
	return strings.Contains(normalized, "qwen3-tts")
}

func isAliNativeTTSBillingUnit(info *relaycommon.RelayInfo, unit string) bool {
	if info == nil {
		return false
	}
	if billing_setting.GetBillingMode(info.OriginModelName) != billing_setting.BillingModeDashScopeNative {
		return false
	}
	spec, ok := billing_setting.GetDashScopeNativePricing(info.OriginModelName)
	return ok && strings.TrimSpace(spec.Unit) == unit
}

func convertAliAudioRequest(info *relaycommon.RelayInfo, request dto.AudioRequest) (io.Reader, error) {
	if info == nil {
		return nil, errors.New("relay info is nil")
	}
	if info.RelayMode != relayconstant.RelayModeAudioSpeech {
		return nil, fmt.Errorf("Ali audio adaptor only supports speech synthesis, relay mode: %d", info.RelayMode)
	}
	if strings.TrimSpace(request.Input) == "" {
		return nil, errors.New("input is required")
	}
	modelName := strings.TrimSpace(request.Model)
	if modelName == "" {
		modelName = strings.TrimSpace(info.UpstreamModelName)
	}
	if modelName == "" {
		return nil, errors.New("model is required")
	}
	if isAliQwen3TTSModel(modelName) {
		return convertAliQwen3AudioRequest(modelName, request)
	}
	input := map[string]any{
		"text": request.Input,
		"format":      normalizeAliTTSFormat(request.ResponseFormat),
		"sample_rate": defaultAliTTSSampleRate,
	}
	if strings.TrimSpace(request.Voice) != "" {
		input["voice"] = request.Voice
	}
	if strings.TrimSpace(request.Instructions) != "" {
		input["instruction"] = request.Instructions
	}
	if request.Speed != nil {
		input["rate"] = *request.Speed
	}
	mergeAliTTSMetadata(input, request.Metadata)
	if voice, ok := input["voice"].(string); ok {
		input["voice"] = normalizeAliTTSVoiceAlias(modelName, voice)
	}
	if err := validateAliTTSModelVoice(modelName, input); err != nil {
		return nil, err
	}
	body, err := common.Marshal(map[string]any{
		"model": modelName,
		"input": input,
	})
	if err != nil {
		return nil, fmt.Errorf("marshal Ali TTS request: %w", err)
	}
	return bytes.NewReader(body), nil
}

func convertAliQwen3AudioRequest(modelName string, request dto.AudioRequest) (io.Reader, error) {
	input := map[string]any{
		"text":          request.Input,
		"language_type": "Auto",
	}
	if strings.TrimSpace(request.Voice) != "" {
		input["voice"] = request.Voice
	}
	if strings.TrimSpace(request.Instructions) != "" {
		input["instructions"] = request.Instructions
	}
	if request.Speed != nil {
		input["rate"] = *request.Speed
	}
	mergeAliTTSMetadata(input, request.Metadata)
	if err := validateAliTTSModelVoice(modelName, input); err != nil {
		return nil, err
	}
	body, err := common.Marshal(map[string]any{
		"model": modelName,
		"input": input,
	})
	if err != nil {
		return nil, fmt.Errorf("marshal Ali Qwen3 TTS request: %w", err)
	}
	return bytes.NewReader(body), nil
}

func validateAliTTSModelVoice(modelName string, input map[string]any) error {
	voice, _ := input["voice"].(string)
	voice = strings.TrimSpace(voice)
	if voice == "" {
		return errors.New("Ali TTS requires input.voice; use a built-in voice or a registered cloned/designed voice")
	}

	return nil
}

func normalizeAliTTSVoiceAlias(modelName string, voice string) string {
	trimmedVoice := strings.TrimSpace(voice)
	normalizedModel := strings.ToLower(strings.TrimSpace(modelName))
	normalizedVoice := strings.ToLower(trimmedVoice)

	switch {
	case strings.Contains(normalizedModel, "qwen-audio-3.0-tts-flash"):
		return normalizeAliTTSVoiceFromMap(trimmedVoice, normalizedVoice, map[string]string{
			"longanhuan":   "longanhuan_v3.6",
			"longjielidou": "longjielidou_v3.6",
			"loongeva":     "loongeva_v3.6",
		})
	case strings.Contains(normalizedModel, "cosyvoice-v3.5") || strings.Contains(normalizedModel, "cosyvoice-v3"):
		return normalizeAliTTSVoiceFromMap(trimmedVoice, normalizedVoice, map[string]string{
			"longxiaochun": "longxiaochun_v3",
			"longxiaoxia":  "longxiaoxia_v3",
			"longcheng":    "longcheng_v3",
			"longwan":      "longwan_v3",
			"loongbella":   "loongbella_v3",
			"loongstella":  "loongstella_v3",
		})
	case strings.Contains(normalizedModel, "cosyvoice-v2"):
		return normalizeAliTTSVoiceFromMap(trimmedVoice, normalizedVoice, map[string]string{
			"longxiaochun": "longxiaochun_v2",
			"longxiaoxia":  "longxiaoxia_v2",
			"longcheng":    "longcheng_v2",
			"longwan":      "longwan_v2",
			"loongbella":   "loongbella_v2",
			"loongstella":  "loongstella_v2",
		})
	default:
		return trimmedVoice
	}
}

func normalizeAliTTSVoiceFromMap(original string, normalized string, aliases map[string]string) string {
	if replacement, ok := aliases[normalized]; ok {
		return replacement
	}
	return original
}

func isKnownAliSystemVoice(voice string) bool {
	switch strings.ToLower(strings.TrimSpace(voice)) {
	case
		"longxiaochun",
		"longxiaochun_v2",
		"longxiaochun_v3",
		"longanhuan",
		"longanhuan_v3.6",
		"longanlingxi",
		"longcheng",
		"longwan",
		"loongbella",
		"loongstella":
		return true
	default:
		return false
	}
}

func normalizeAliTTSFormat(format string) string {
	switch strings.ToLower(strings.TrimSpace(format)) {
	case "wav", "pcm", "opus", "flac", "mp3":
		return strings.ToLower(strings.TrimSpace(format))
	default:
		return defaultAliTTSFormat
	}
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed != "" {
			return trimmed
		}
	}
	return ""
}

func mergeAliTTSMetadata(input map[string]any, raw json.RawMessage) {
	if len(raw) == 0 || string(raw) == "null" {
		return
	}
	var metadata map[string]any
	if err := common.Unmarshal(raw, &metadata); err != nil {
		return
	}
	if nested, ok := metadata["input"].(map[string]any); ok {
		for key, value := range nested {
			input[key] = value
		}
	}
	if nested, ok := metadata["parameters"].(map[string]any); ok {
		for key, value := range nested {
			input[key] = value
		}
	}
	for key, value := range metadata {
		if key == "input" || key == "parameters" || key == "model" {
			continue
		}
		input[key] = value
	}
}

func aliTTSSpeechHandler(c *gin.Context, resp *http.Response, info *relaycommon.RelayInfo) (*dto.Usage, *types.NewAPIError) {
	if resp == nil {
		return nil, types.NewOpenAIError(errors.New("Ali TTS response is nil"), types.ErrorCodeBadResponseBody, http.StatusBadGateway)
	}
	defer service.CloseResponseBodyGracefully(resp)
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxAliTTSAudioBytes))
	if err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeReadResponseBodyFailed, http.StatusBadGateway)
	}
	var aliResp aliTTSResponse
	if err := common.Unmarshal(body, &aliResp); err != nil {
		if len(body) == 0 {
			return nil, types.NewOpenAIError(errors.New("Ali TTS returned an empty response"), types.ErrorCodeBadResponseBody, http.StatusBadGateway)
		}
		return writeAliTTSBytes(c, body, resp.Header.Get("Content-Type"), info)
	}
	if aliResp.Code != "" {
		message := strings.TrimSpace(aliResp.Message)
		if message == "" {
			message = aliResp.Code
		}
		return nil, types.NewOpenAIError(errors.New(message), types.ErrorCodeBadResponseBody, http.StatusBadGateway)
	}
	if aliResp.Usage.Characters > 0 {
		info.SetEstimatePromptTokens(aliResp.Usage.Characters)
		if isAliNativeTTSBillingUnit(info, "character") {
			info.PriceData.AddOtherRatio("native_quantity", float64(aliResp.Usage.Characters))
		}
	}
	audioBytes, contentType, err := resolveAliTTSAudio(c, info, aliResp)
	if err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeBadResponseBody, http.StatusBadGateway)
	}
	return writeAliTTSBytes(c, audioBytes, contentType, info)
}

func resolveAliTTSAudio(c *gin.Context, info *relaycommon.RelayInfo, response aliTTSResponse) ([]byte, string, error) {
	audioData := firstNonEmpty(response.Output.Audio.Data, response.Output.Data)
	if audioData != "" {
		decoded, err := base64.StdEncoding.DecodeString(audioData)
		if err != nil {
			decoded, err = base64.RawStdEncoding.DecodeString(audioData)
		}
		if err != nil {
			return nil, "", fmt.Errorf("decode Ali TTS audio data: %w", err)
		}
		return decoded, aliTTSContentType(info), nil
	}
	audioURL := firstNonEmpty(response.Output.Audio.URL, response.Output.AudioURL, response.Output.URL)
	if audioURL == "" {
		return nil, "", errors.New("Ali TTS response does not contain output.audio.url, output.audio_url, output.url, output.audio.data, or output.data")
	}
	parsed, err := url.Parse(audioURL)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return nil, "", errors.New("Ali TTS returned an invalid audio URL")
	}
	req, err := http.NewRequestWithContext(c.Request.Context(), http.MethodGet, audioURL, nil)
	if err != nil {
		return nil, "", fmt.Errorf("create Ali TTS audio download request: %w", err)
	}
	proxy := ""
	if info != nil && info.ChannelMeta != nil {
		proxy = info.ChannelSetting.Proxy
	}
	client, err := service.GetHttpClientWithProxy(proxy)
	if err != nil {
		return nil, "", fmt.Errorf("create Ali TTS audio download client: %w", err)
	}
	audioResp, err := client.Do(req)
	if err != nil {
		return nil, "", fmt.Errorf("download Ali TTS audio: %w", err)
	}
	defer service.CloseResponseBodyGracefully(audioResp)
	if audioResp.StatusCode < http.StatusOK || audioResp.StatusCode >= http.StatusMultipleChoices {
		return nil, "", fmt.Errorf("download Ali TTS audio returned status %d", audioResp.StatusCode)
	}
	audioBytes, err := io.ReadAll(io.LimitReader(audioResp.Body, maxAliTTSAudioBytes))
	if err != nil {
		return nil, "", fmt.Errorf("read Ali TTS audio: %w", err)
	}
	if len(audioBytes) == 0 {
		return nil, "", errors.New("Ali TTS audio URL returned an empty body")
	}
	contentType := audioResp.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "audio/mpeg"
	}
	return audioBytes, contentType, nil
}

func writeAliTTSBytes(c *gin.Context, audioBytes []byte, contentType string, info *relaycommon.RelayInfo) (*dto.Usage, *types.NewAPIError) {
	if len(audioBytes) == 0 {
		return nil, types.NewOpenAIError(errors.New("Ali TTS returned empty audio"), types.ErrorCodeBadResponseBody, http.StatusBadGateway)
	}
	if contentType == "" {
		contentType = "audio/mpeg"
	}
	audioResp := &http.Response{
		StatusCode: http.StatusOK,
		Header: http.Header{
			"Content-Type":   []string{contentType},
			"Content-Length": []string{fmt.Sprintf("%d", len(audioBytes))},
		},
		Body: io.NopCloser(bytes.NewReader(audioBytes)),
	}
	return openai.OpenaiTTSHandler(c, audioResp, info), nil
}

func aliTTSContentType(info *relaycommon.RelayInfo) string {
	format := defaultAliTTSFormat
	if info != nil {
		if audioReq, ok := info.Request.(*dto.AudioRequest); ok {
			format = normalizeAliTTSFormat(audioReq.ResponseFormat)
		}
	}
	switch format {
	case "wav":
		return "audio/wav"
	case "pcm":
		return "audio/L16"
	case "opus":
		return "audio/ogg"
	case "flac":
		return "audio/flac"
	default:
		return "audio/mpeg"
	}
}
'''


def patch_ali_audio_adaptor() -> None:
    audio_go = ALI_AUDIO_GO
    if (ROOT / "relaykit/dto").is_dir():
        audio_go = audio_go.replace(
            '"github.com/QuantumNous/new-api/dto"',
            '"github.com/QuantumNous/new-api/relaykit/dto"',
        )
    if (ROOT / "relaykit/types").is_dir():
        audio_go = audio_go.replace(
            '"github.com/QuantumNous/new-api/types"',
            '"github.com/QuantumNous/new-api/relaykit/types"',
        )
    write("relay/channel/ali/audio.go", audio_go)
    rel = "relay/channel/ali/adaptor.go"
    text = read(rel)
    old_audio_url = '\t\tcase constant.RelayModeAudioSpeech:\n\t\t\tfullRequestURL = fmt.Sprintf("%s/api/v1/services/audio/tts/SpeechSynthesizer", info.ChannelBaseUrl)\n'
    new_audio_url = '\t\tcase constant.RelayModeAudioSpeech:\n\t\t\tif isAliQwen3TTSModel(info.OriginModelName) || isAliQwen3TTSModel(info.UpstreamModelName) {\n\t\t\t\tfullRequestURL = fmt.Sprintf("%s/api/v1/services/aigc/multimodal-generation/generation", info.ChannelBaseUrl)\n\t\t\t} else {\n\t\t\t\tfullRequestURL = fmt.Sprintf("%s/api/v1/services/audio/tts/SpeechSynthesizer", info.ChannelBaseUrl)\n\t\t\t}\n'
    if "isAliQwen3TTSModel(info.OriginModelName)" not in text and old_audio_url in text:
        text = text.replace(old_audio_url, new_audio_url, 1)
    if "RelayModeAudioSpeech" not in text.split("case constant.RelayModeEmbeddings:", 1)[0]:
        text = replace_once(
            text,
            "\t\tcase constant.RelayModeEmbeddings:\n",
            new_audio_url + "\t\tcase constant.RelayModeEmbeddings:\n",
            "Ali TTS request URL",
        )
    if 'info.RelayMode == constant.RelayModeAudioSpeech' not in text:
        text = replace_once(
            text,
            '\treq.Set("Authorization", "Bearer "+info.ApiKey)\n',
            '\treq.Set("Authorization", "Bearer "+info.ApiKey)\n\tif info.RelayMode == constant.RelayModeAudioSpeech {\n\t\treq.Set("Content-Type", "application/json")\n\t}\n',
            "Ali TTS content-type header",
        )
    if "return convertAliAudioRequest(info, request)" not in text:
        text = replace_once_regex(
            text,
            r'func \(a \*Adaptor\) ConvertAudioRequest\(c \*gin\.Context, info \*relaycommon\.RelayInfo, request dto\.AudioRequest\) \(io\.Reader, error\) \{\n(?:.|\n)*?\n\}',
            'func (a *Adaptor) ConvertAudioRequest(c *gin.Context, info *relaycommon.RelayInfo, request dto.AudioRequest) (io.Reader, error) {\n\treturn convertAliAudioRequest(info, request)\n}',
            "Ali ConvertAudioRequest",
        )
    if "aliTTSSpeechHandler" not in text:
        text = replace_once(
            text,
            "\t\tcase constant.RelayModeImagesEdits:\n\t\t\terr, usage = aliImageHandler(a, c, resp, info)\n",
            "\t\tcase constant.RelayModeImagesEdits:\n\t\t\terr, usage = aliImageHandler(a, c, resp, info)\n\t\tcase constant.RelayModeAudioSpeech:\n\t\t\tusage, err = aliTTSSpeechHandler(c, resp, info)\n",
            "Ali TTS response handler",
        )
    write(rel, text)

    rel = "relay/audio_handler.go"
    text = read(rel)
    if "TTS providers commonly return the actionable model/voice error in JSON" not in text:
        text = replace_once(
            text,
            "\t\t\tnewAPIError = service.RelayErrorHandler(c.Request.Context(), httpResp, false)\n",
            "\t\t\t// TTS providers commonly return the actionable model/voice error in JSON.\n"
            "\t\t\t// Keep that body visible so an upstream 4xx/5xx is not reduced to a bare status.\n"
            "\t\t\tnewAPIError = service.RelayErrorHandler(c.Request.Context(), httpResp, true)\n",
            "Ali TTS upstream error body",
        )
    if "audio adaptor returned invalid usage" not in text:
        text = replace_once(
            text,
            '''	if usage.(*dto.Usage).CompletionTokenDetails.AudioTokens > 0 || usage.(*dto.Usage).PromptTokensDetails.AudioTokens > 0 {
		service.PostAudioConsumeQuota(c, info, usage.(*dto.Usage), "")
	} else {
		service.PostTextConsumeQuota(c, info, usage.(*dto.Usage), nil)
	}
''',
            '''	audioUsage, ok := usage.(*dto.Usage)
	if !ok || audioUsage == nil {
		return types.NewError(errors.New("audio adaptor returned invalid usage"), types.ErrorCodeBadResponseBody, types.ErrOptionWithSkipRetry())
	}
	if audioUsage.PromptTokens == 0 {
		audioUsage.PromptTokens = info.GetEstimatePromptTokens()
	}
	if audioUsage.TotalTokens == 0 {
		audioUsage.TotalTokens = audioUsage.PromptTokens + audioUsage.CompletionTokens
	}
	if audioUsage.CompletionTokenDetails.AudioTokens > 0 || audioUsage.PromptTokensDetails.AudioTokens > 0 {
		service.PostAudioConsumeQuota(c, info, audioUsage, "")
	} else {
		service.PostTextConsumeQuota(c, info, audioUsage, nil)
	}
''',
            "audio usage nil guard",
        )
    write(rel, text)

    rel = "relay/channel/api_request.go"
    path = ROOT / rel
    if path.exists():
        text = read(rel)
        patched = patch_safe_proxy_request_helper(text)
        if patched != text:
            write(rel, patched)


def patch_channel_test_audio_default_voice() -> None:
    rel = "controller/channel-test.go"
    path = ROOT / rel
    if not path.exists():
        return
    text = read(rel)
    audio_case_pattern = (
        r'(case constant\.EndpointTypeAudioSpeech:\s*\n'
        r'\s*return &dto\.AudioRequest\{\s*\n'
        r'\s*Model:\s*model,\s*\n'
        r'\s*Input:\s*"[^"]*",\s*\n'
        r'\s*Voice:\s*)"[^"]*"'
    )
    text = re.sub(
        audio_case_pattern,
        r'\g<1>defaultAudioSpeechTestVoice(model, channel)',
        text,
        count=1,
        flags=re.MULTILINE,
    )
    if "func defaultAudioSpeechTestVoice(" not in text:
        helper = r'''
func defaultAudioSpeechTestVoice(modelName string, channel *model.Channel) string {
	normalizedModel := strings.ToLower(strings.TrimSpace(modelName))
	if channel != nil && (channel.Type == constant.ChannelTypeAli || channel.Type == constant.ChannelTypeAliDashScopeNative) {
		switch {
		case strings.Contains(normalizedModel, "qwen-audio-3.0-tts-flash"):
			return "longanhuan_v3.6"
		case strings.Contains(normalizedModel, "qwen-audio-3.0-tts-plus"):
			return "longanlingxin"
		case strings.Contains(normalizedModel, "cosyvoice-v3.5"),
			strings.Contains(normalizedModel, "cosyvoice-v3"):
			return "longxiaochun_v3"
		case strings.Contains(normalizedModel, "cosyvoice-v2"):
			return "longxiaochun_v2"
		default:
			return "longxiaochun_v3"
		}
	}
	return "alloy"
}
'''
        text = insert_before_regex(text, r'^\s*func TestChannel\(', helper + "\n", "channel test function")
    write(rel, text)


def patch_audio_pricing_meta() -> None:
    rel = "controller/relay.go"
    path = ROOT / rel
    if path.exists():
        text = read(rel)
        if "TTS fixed/character pricing needs the input text" not in text:
            text = replace_once(
                text,
                '''	case *dto.ImageRequest:
		// Pricing for image requests depends on ImagePriceRatio; safe to compute even when CountToken is disabled.
		return r.GetTokenCountMeta()
	default:
''',
                '''	case *dto.ImageRequest:
		// Pricing for image requests depends on ImagePriceRatio; safe to compute even when CountToken is disabled.
		return r.GetTokenCountMeta()
	case *dto.AudioRequest:
		// TTS fixed/character pricing needs the input text even when full token counting is disabled.
		return r.GetTokenCountMeta()
	default:
''',
                "audio request fast pricing meta",
            )
            write(rel, text)

    rel = "relay/helper/price.go"
    text = read(rel)
    if not re.search(r'func ModelPriceHelper\([^)]*\)[^{]*\{\n\s*if meta == nil \{', text):
        text = replace_once_regex(
            text,
            r'(func ModelPriceHelper\(c \*gin\.Context, info \*relaycommon\.RelayInfo, promptTokens int, meta \*[^)]+\) \([^)]+, error\) \{\n)',
            r'\g<1>	if meta == nil {\n\t\tmeta = &types.TokenCountMeta{}\n\t}\n',
            "ModelPriceHelper nil token meta guard",
        )
    if not re.search(r'func modelPriceHelperTiered\([^)]*\)[^{]*\{\n\s*if meta == nil \{', text):
        text = replace_once_regex(
            text,
            r'(func modelPriceHelperTiered\(c \*gin\.Context, info \*relaycommon\.RelayInfo, promptTokens int, meta \*[^,]+, groupRatioInfo [^)]+\) \([^)]+, error\) \{\n)',
            r'\g<1>	if meta == nil {\n\t\tmeta = &types.TokenCountMeta{}\n\t}\n',
            "tiered price nil token meta guard",
        )
    write(rel, text)


def price_helper_type_names(text: str) -> tuple[str, str, str]:
    price_data_type = "types.PriceData"
    model_sig = re.search(r'func\s+ModelPriceHelper\s*\([^)]*\)\s*\(([^,]+),\s*error\)', text)
    if model_sig:
        price_data_type = model_sig.group(1).strip()

    group_ratio_type = "types.GroupRatioInfo"
    group_sig = re.search(r'func\s+HandleGroupRatio\s*\([^)]*\)\s*([^\s{]+)\s*\{', text)
    if group_sig:
        group_ratio_type = group_sig.group(1).strip()

    token_meta_type = "types.TokenCountMeta"
    if "meta *hosttypes.TokenCountMeta" in text:
        token_meta_type = "hosttypes.TokenCountMeta"
    return price_data_type, group_ratio_type, token_meta_type


def ensure_price_helper_imports(text: str, imports: list[str]) -> str:
    missing = [item for item in imports if item not in text]
    if not missing:
        return text
    import_match = re.search(r'import\s*\(\s*\n', text)
    if import_match:
        return text[: import_match.end()] + "".join(f"\t{item}\n" for item in missing) + text[import_match.end() :]
    single_import_match = re.search(r'import\s+([^\n]+)\n', text)
    if not single_import_match:
        raise SystemExit("Ali video/audio endpoint patch failed: price helper import block not found")
    existing_import = single_import_match.group(1).strip()
    import_block = "import (\n\t" + existing_import + "\n" + "".join(f"\t{item}\n" for item in missing) + ")\n"
    return text[: single_import_match.start()] + import_block + text[single_import_match.end() :]


def patch_dashscope_native_task_pricing() -> None:
    rel = "relay/helper/price.go"
    text = read(rel)
    price_data_type, group_ratio_type, token_meta_type = price_helper_type_names(text)
    text = ensure_price_helper_imports(text, ['"github.com/QuantumNous/new-api/constant"'])
    if '"unicode/utf8"' not in text:
        text = replace_once(
            text,
            '\t"strings"\n',
            '\t"strings"\n\t"unicode/utf8"\n',
            "price helper utf8 import",
        )
    if "func modelPriceHelperDashScopeNative(" not in text:
        helpers = r'''
func relayInfoChannelType(c *gin.Context, info *relaycommon.RelayInfo) int {
	if info != nil && info.ChannelMeta != nil {
		return info.ChannelType
	}
	if c != nil {
		return common.GetContextKeyInt(c, constant.ContextKeyChannelType)
	}
	return 0
}

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

func applyDashScopeNativeRelayRatios(info *relaycommon.RelayInfo, priceData *__PRICE_DATA_TYPE__, promptTokens int, meta *__TOKEN_META_TYPE__) {
	if info == nil || priceData == nil {
		return
	}
	spec, ok := billing_setting.GetDashScopeNativePricing(info.OriginModelName)
	if !ok {
		return
	}
	switch strings.TrimSpace(spec.Unit) {
	case "character":
		quantity := promptTokens
		if quantity <= 0 && meta != nil {
			quantity = utf8.RuneCountInString(meta.CombineText)
		}
		if quantity <= 0 {
			quantity = 1
		}
		priceData.AddOtherRatio("native_quantity", float64(quantity))
	case "image":
		if meta != nil {
			for name, ratio := range meta.BillingRatios {
				priceData.AddOtherRatio(name, ratio)
			}
		}
	case "request", "video_task", "token_input_output":
	}
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

'''.replace("__PRICE_DATA_TYPE__", price_data_type).replace("__GROUP_RATIO_TYPE__", group_ratio_type).replace("__TOKEN_META_TYPE__", token_meta_type)
        text = insert_before_regex(
            text,
            r'^(?:// ModelPriceHelperPerCall.*\n)?func ModelPriceHelperPerCall\(',
            helpers,
            "DashScope Native relay quantity ratios",
        )
    else:
        if "func relayInfoChannelType(" not in text:
            text = insert_before_regex(
                text,
                r'^func modelPriceHelperDashScopeNative\(info \*relaycommon\.RelayInfo, groupRatioInfo [^)]+\) \([^)]+, error\) \{\s*$',
                '''func relayInfoChannelType(c *gin.Context, info *relaycommon.RelayInfo) int {
	if info != nil && info.ChannelMeta != nil {
		return info.ChannelType
	}
	if c != nil {
		return common.GetContextKeyInt(c, constant.ContextKeyChannelType)
	}
	return 0
}

''',
                "DashScope Native relay channel type helper",
            )
        if "func applyDashScopeNativeRelayRatios(" not in text:
            snippet = '''func applyDashScopeNativeRelayRatios(info *relaycommon.RelayInfo, priceData *__PRICE_DATA_TYPE__, promptTokens int, meta *__TOKEN_META_TYPE__) {
	if info == nil || priceData == nil {
		return
	}
	spec, ok := billing_setting.GetDashScopeNativePricing(info.OriginModelName)
	if !ok {
		return
	}
	switch strings.TrimSpace(spec.Unit) {
	case "character":
		quantity := promptTokens
		if quantity <= 0 && meta != nil {
			quantity = utf8.RuneCountInString(meta.CombineText)
		}
		if quantity <= 0 {
			quantity = 1
		}
		priceData.AddOtherRatio("native_quantity", float64(quantity))
	case "image":
		if meta != nil {
			for name, ratio := range meta.BillingRatios {
				priceData.AddOtherRatio(name, ratio)
			}
		}
	case "request", "video_task", "token_input_output":
	}
}

'''.replace("__PRICE_DATA_TYPE__", price_data_type).replace("__TOKEN_META_TYPE__", token_meta_type)
            if "func dashScopeNativeMaxFloat64(" in text:
                text = insert_before_regex(
                    text,
                    r'^func dashScopeNativeMaxFloat64\(values \.\.\.float64\) float64 \{\s*$',
                    snippet + "\n",
                    "DashScope Native relay quantity ratios",
                )
            else:
                text = insert_before_regex(
                    text,
                    r'^func maxFloat64\(values \.\.\.float64\) float64 \{\s*$',
                    snippet + "\n",
                    "DashScope Native relay quantity ratios",
                )
    if "applyDashScopeNativeRelayRatios(info, &priceData, promptTokens, meta)" not in text:
        native_relay_branch = '''	if billing_setting.GetBillingMode(info.OriginModelName) == billing_setting.BillingModeDashScopeNative {
		groupRatioInfo := HandleGroupRatio(c, info)
		if relayInfoChannelType(c, info) != constant.ChannelTypeAliDashScopeNative {
			return __PRICE_DATA_TYPE__{}, fmt.Errorf("model %s uses dashscope_native billing and can only be billed through Ali SDK / DashScope Native native routes", info.OriginModelName)
		}
		priceData, err := modelPriceHelperDashScopeNative(info, groupRatioInfo)
		if err != nil {
			return __PRICE_DATA_TYPE__{}, err
		}
		applyDashScopeNativeRelayRatios(info, &priceData, promptTokens, meta)
		quotaToPreConsume := priceData.ApplyOtherRatiosToFloat(priceData.ModelPrice * common.QuotaPerUnit * groupRatioInfo.GroupRatio)
		quota, err := common.QuotaFromFloatStrict(quotaToPreConsume)
		if err != nil {
			return __PRICE_DATA_TYPE__{}, err
		}
		if !operation_setting.GetQuotaSetting().EnableFreeModelPreConsume {
			if groupRatioInfo.GroupRatio == 0 || priceData.ModelPrice == 0 {
				quota = 0
				priceData.FreeModel = true
			}
		}
		priceData.QuotaToPreConsume = quota
		info.PriceData = priceData
		return priceData, nil
	}
'''.replace("__PRICE_DATA_TYPE__", price_data_type)
        text, count = re.subn(
            r'\tif (?:billingMode|billing_setting\.GetBillingMode\(info\.OriginModelName\)) == billing_setting\.BillingModeDashScopeNative \{\n(?:\t\t.*\n)*?\t\treturn modelPriceHelperDashScopeNative\(info, groupRatioInfo\)\n\t\}\n',
            native_relay_branch,
            text,
            count=1,
            flags=re.MULTILINE,
        )
        if count == 0:
            text = insert_before_regex(
                text,
                r'^\s*var preConsumedQuota int\s*$',
                native_relay_branch + "\n",
                "DashScope Native relay pre-consume pricing",
            )
    per_call_branch = '''	if billing_setting.GetBillingMode(info.OriginModelName) == billing_setting.BillingModeDashScopeNative {
		if relayInfoChannelType(c, info) != constant.ChannelTypeAliDashScopeNative {
			return __PRICE_DATA_TYPE__{}, fmt.Errorf("model %s uses dashscope_native billing and can only be billed through Ali SDK / DashScope Native native routes", info.OriginModelName)
		}
		priceData, err := modelPriceHelperDashScopeNative(info, groupRatioInfo)
		if err != nil {
			return __PRICE_DATA_TYPE__{}, err
		}
		quota, err := common.QuotaFromFloatStrict(priceData.ModelPrice * common.QuotaPerUnit * groupRatioInfo.GroupRatio)
		if err != nil {
			return __PRICE_DATA_TYPE__{}, err
		}
		if !operation_setting.GetQuotaSetting().EnableFreeModelPreConsume {
			if groupRatioInfo.GroupRatio == 0 || priceData.ModelPrice == 0 {
				quota = 0
				priceData.FreeModel = true
			}
		}
		priceData.Quota = quota
		info.PriceData = priceData
		return priceData, nil
	}

'''.replace("__PRICE_DATA_TYPE__", price_data_type)
    if per_call_branch.strip() not in text:
        text = replace_once_regex(
            text,
            r'(func ModelPriceHelperPerCall\(c \*gin\.Context, info \*relaycommon\.RelayInfo\) \([^)]+, error\) \{\n\tgroupRatioInfo := HandleGroupRatio\(c, info\)\n\n)',
            r'\g<1>' + per_call_branch,
            "DashScope Native task per-call pricing",
        )
    if "billingMode := billing_setting.GetBillingMode(modelName)" not in text:
        text = replace_once(
            text,
            '''	if billing_setting.GetBillingMode(modelName) != billing_setting.BillingModeTieredExpr {
		return false
	}
	expr, ok := billing_setting.GetBillingExpr(modelName)
	return ok && strings.TrimSpace(expr) != ""
''',
            '''	billingMode := billing_setting.GetBillingMode(modelName)
	if billingMode == billing_setting.BillingModeDashScopeNative {
		_, ok := billing_setting.GetDashScopeNativePricing(modelName)
		return ok
	}
	if billingMode != billing_setting.BillingModeTieredExpr {
		return false
	}
	expr, ok := billing_setting.GetBillingExpr(modelName)
	return ok && strings.TrimSpace(expr) != ""
''',
            "DashScope Native billing config detector",
        )
    write(rel, text)

    rel = "service/quota.go"
    text = read(rel)
    if '"github.com/QuantumNous/new-api/setting/billing_setting"' not in text:
        text = replace_once(
            text,
            '\trelaycommon "github.com/QuantumNous/new-api/relay/common"\n',
            '\trelaycommon "github.com/QuantumNous/new-api/relay/common"\n\t"github.com/QuantumNous/new-api/setting/billing_setting"\n',
            "service quota billing setting import",
        )
    if "OtherRatioMultiplier float64" not in text:
        text = replace_once(
            text,
            '''type QuotaInfo struct {
	InputDetails  TokenDetails
	OutputDetails TokenDetails
	ModelName     string
	UsePrice      bool
	ModelPrice    float64
	ModelRatio    float64
	GroupRatio    float64
}
''',
            '''type QuotaInfo struct {
	InputDetails         TokenDetails
	OutputDetails        TokenDetails
	ModelName            string
	UsePrice             bool
	ModelPrice           float64
	ModelRatio           float64
	GroupRatio           float64
	OtherRatioMultiplier float64
}
''',
            "audio quota info native ratio field",
        )
    if "otherRatio := decimal.NewFromFloat(info.OtherRatioMultiplier)" not in text:
        text = replace_once(
            text,
            '''		groupRatio := decimal.NewFromFloat(info.GroupRatio)

		quota := modelPrice.Mul(quotaPerUnit).Mul(groupRatio)
''',
            '''		groupRatio := decimal.NewFromFloat(info.GroupRatio)
		otherRatio := decimal.NewFromFloat(info.OtherRatioMultiplier)
		if info.OtherRatioMultiplier <= 0 {
			otherRatio = decimal.NewFromInt(1)
		}

		quota := modelPrice.Mul(quotaPerUnit).Mul(groupRatio).Mul(otherRatio)
''',
            "audio fixed price native ratio multiplier",
        )
    audio_quota_block = '''		UsePrice:   usePrice,
		ModelRatio: modelRatio,
		GroupRatio: groupRatio,
	}

	quota, clamp := calculateAudioQuota(quotaInfo)
'''
    audio_quota_block_with_native_ratio = '''		UsePrice:   usePrice,
		ModelRatio: modelRatio,
		GroupRatio: groupRatio,
	}
	if usePrice {
		quotaInfo.OtherRatioMultiplier = relayInfo.PriceData.OtherRatioMultiplier()
	}

	quota, clamp := calculateAudioQuota(quotaInfo)
'''
    if audio_quota_block in text:
        text = text.replace(audio_quota_block, audio_quota_block_with_native_ratio)
    if "func dashScopeNativeAudioPostMultiplier(" not in text:
        text = text.rstrip() + r'''

func dashScopeNativeAudioPostMultiplier(relayInfo *relaycommon.RelayInfo, usage *dto.Usage) float64 {
	if relayInfo == nil || usage == nil {
		return 0
	}
	if billing_setting.GetBillingMode(relayInfo.OriginModelName) != billing_setting.BillingModeDashScopeNative {
		return 0
	}
	spec, ok := billing_setting.GetDashScopeNativePricing(relayInfo.OriginModelName)
	if !ok || strings.TrimSpace(spec.Unit) != "audio_second" {
		return 0
	}
	audioTokens := usage.CompletionTokenDetails.AudioTokens
	if audioTokens <= 0 {
		return 1
	}
	seconds := math.Ceil(float64(audioTokens) * 60 / 1000)
	if seconds < 1 {
		seconds = 1
	}
	return seconds
}
'''
    if "nativeAudioMultiplier := dashScopeNativeAudioPostMultiplier(relayInfo, usage)" not in text:
        text = replace_once_regex(
            text,
            r'(func PostAudioConsumeQuota\(ctx \*gin\.Context, relayInfo \*relaycommon\.RelayInfo, usage \*dto\.Usage, extraContent string\) \{\n(?:.|\n)*?\tif usePrice \{\n\t\tquotaInfo\.OtherRatioMultiplier = relayInfo\.PriceData\.OtherRatioMultiplier\(\)\n\t\}\n)',
            r'''\g<1>	if nativeAudioMultiplier := dashScopeNativeAudioPostMultiplier(relayInfo, usage); nativeAudioMultiplier > 0 {
		if quotaInfo.OtherRatioMultiplier <= 0 {
			quotaInfo.OtherRatioMultiplier = 1
		}
		quotaInfo.OtherRatioMultiplier *= nativeAudioMultiplier
	}
''',
            "post audio native audio_second multiplier",
        )
    write(rel, text)

    rel = "relay/channel/task/ali/adaptor.go"
    text = read(rel)
    if '"github.com/QuantumNous/new-api/constant"' not in text:
        text = replace_once(
            text,
            '\t"github.com/QuantumNous/new-api/common"\n',
            '\t"github.com/QuantumNous/new-api/common"\n\t"github.com/QuantumNous/new-api/constant"\n',
            "Ali task constant import",
        )
    if '"github.com/QuantumNous/new-api/setting/billing_setting"' not in text:
        text = replace_once(
            text,
            '\t"github.com/QuantumNous/new-api/service"\n',
            '\t"github.com/QuantumNous/new-api/service"\n\t"github.com/QuantumNous/new-api/setting/billing_setting"\n',
            "Ali task billing setting import",
        )

    native_helpers = r'''
func normalizeAliVideoSize(size string) string {
	normalized := strings.TrimSpace(size)
	normalized = strings.ReplaceAll(normalized, "×", "*")
	normalized = strings.ReplaceAll(normalized, "X", "*")
	normalized = strings.ReplaceAll(normalized, "x", "*")
	return normalized
}

func dashScopeNativeVideoResolution(aliReq *AliVideoRequest) string {
	if aliReq == nil || aliReq.Parameters == nil {
		return ""
	}
	if aliReq.Parameters.Size != "" {
		if resolution, err := sizeToResolution(normalizeAliVideoSize(aliReq.Parameters.Size)); err == nil {
			return resolution
		}
	}
	resolution := strings.ToUpper(strings.TrimSpace(aliReq.Parameters.Resolution))
	if resolution == "" {
		return ""
	}
	if !strings.HasSuffix(resolution, "P") {
		resolution += "P"
	}
	return resolution
}

func selectDashScopeNativeVideoTierPrice(prices map[string]float64, aliReq *AliVideoRequest) (float64, string) {
	if len(prices) == 0 {
		return 0, ""
	}
	candidates := []string{
		dashScopeNativeVideoResolution(aliReq),
		"default",
	}
	for _, candidate := range candidates {
		candidate = strings.ToLower(strings.TrimSpace(candidate))
		if candidate == "" {
			continue
		}
		for key, price := range prices {
			if strings.ToLower(strings.TrimSpace(key)) == candidate && price > 0 {
				return price, key
			}
		}
	}
	return 0, ""
}

func (a *TaskAdaptor) dashScopeNativeBillingRatios(info *relaycommon.RelayInfo, aliReq *AliVideoRequest) map[string]float64 {
	if info == nil || aliReq == nil || aliReq.Parameters == nil {
		return nil
	}
	if info.ChannelType != constant.ChannelTypeAliDashScopeNative {
		return nil
	}
	if billing_setting.GetBillingMode(info.OriginModelName) != billing_setting.BillingModeDashScopeNative {
		return nil
	}
	spec, ok := billing_setting.GetDashScopeNativePricing(info.OriginModelName)
	if !ok {
		return nil
	}
	otherRatios := map[string]float64{}
	switch strings.TrimSpace(spec.Unit) {
	case "video_second":
		duration := aliReq.Parameters.Duration
		if duration <= 0 {
			duration = 1
		}
		otherRatios["seconds"] = float64(min(duration, relaycommon.MaxTaskDurationSeconds))
		if price, _ := selectDashScopeNativeVideoTierPrice(spec.Prices, aliReq); price > 0 {
			info.PriceData.ModelPrice = price
			baseQuota, _ := common.QuotaFromFloatChecked(
				price * common.QuotaPerUnit * info.PriceData.GroupRatioInfo.GroupRatio,
			)
			info.PriceData.Quota = baseQuota
		}
	case "request", "video_task":
	default:
		return nil
	}
	return otherRatios
}
'''
    if "func normalizeAliVideoSize(" not in text:
        text = replace_once(
            text,
            "func ProcessAliOtherRatios(aliReq *AliVideoRequest) (map[string]float64, error) {\n",
            native_helpers + "\nfunc ProcessAliOtherRatios(aliReq *AliVideoRequest) (map[string]float64, error) {\n",
            "Ali DashScope Native video billing helpers",
        )
    if '"dashscope_native_tier_"+tierKey' in text:
        text = text.replace(
            '''	if price, tierKey := selectDashScopeNativeVideoTierPrice(spec.Prices, aliReq); price > 0 && info.PriceData.ModelPrice > 0 {
		otherRatios["dashscope_native_tier_"+tierKey] = price / info.PriceData.ModelPrice
	}
''',
            '',
            1,
        )
        text = text.replace(
            '''		otherRatios["seconds"] = float64(min(duration, relaycommon.MaxTaskDurationSeconds))
	case "request", "video_task":
''',
            '''		otherRatios["seconds"] = float64(min(duration, relaycommon.MaxTaskDurationSeconds))
		if price, _ := selectDashScopeNativeVideoTierPrice(spec.Prices, aliReq); price > 0 {
			info.PriceData.ModelPrice = price
			baseQuota, _ := common.QuotaFromFloatChecked(
				price * common.QuotaPerUnit * info.PriceData.GroupRatioInfo.GroupRatio,
			)
			info.PriceData.Quota = baseQuota
		}
	case "request", "video_task":
''',
            1,
        )
    if "shortEdge := min(width, height)" not in text:
        text = replace_once_regex(
            text,
            r'func sizeToResolution\(size string\) \(string, error\) \{\n(?:.|\n)*?\n\}',
            '''func sizeToResolution(size string) (string, error) {
	size = normalizeAliVideoSize(size)
	if lo.Contains(size480p, size) {
		return "480P", nil
	} else if lo.Contains(size720p, size) {
		return "720P", nil
	} else if lo.Contains(size1080p, size) {
		return "1080P", nil
	}
	parts := strings.Split(size, "*")
	if len(parts) == 2 {
		width, wErr := strconv.Atoi(strings.TrimSpace(parts[0]))
		height, hErr := strconv.Atoi(strings.TrimSpace(parts[1]))
		if wErr == nil && hErr == nil && width > 0 && height > 0 {
			shortEdge := min(width, height)
			longEdge := max(width, height)
			switch {
			case shortEdge <= 540 || longEdge <= 900:
				return "480P", nil
			case shortEdge <= 800 || longEdge <= 1400:
				return "720P", nil
			default:
				return "1080P", nil
			}
		}
	}
	return "", fmt.Errorf("invalid size: %s", size)
}''',
            "Ali extended video size resolution mapping",
        )

    old_size_block = '''	if req.Size != "" {
		// text to video size must be contained *
		if strings.Contains(req.Model, "t2v") && !strings.Contains(req.Size, "*") {
			return nil, fmt.Errorf("invalid size: %s, example: %s", req.Size, "1920*1080")
		}
		if strings.Contains(req.Size, "*") {
			aliReq.Parameters.Size = req.Size
		} else {
			resolution := strings.ToUpper(req.Size)
			// 支持 480p, 720p, 1080p 或 480P, 720P, 1080P
			if !strings.HasSuffix(resolution, "P") {
				resolution = resolution + "P"
			}
			aliReq.Parameters.Resolution = resolution
		}
'''
    new_size_block = '''	if req.Size != "" {
		normalizedSize := normalizeAliVideoSize(req.Size)
		if strings.Contains(normalizedSize, "*") {
			if strings.Contains(req.Model, "t2v") {
				aliReq.Parameters.Size = normalizedSize
			} else {
				resolution, err := sizeToResolution(normalizedSize)
				if err != nil {
					return nil, err
				}
				aliReq.Parameters.Resolution = resolution
			}
		} else {
			resolution := strings.ToUpper(normalizedSize)
			// 支持 480p, 720p, 1080p 或 480P, 720P, 1080P
			if !strings.HasSuffix(resolution, "P") {
				resolution = resolution + "P"
			}
			aliReq.Parameters.Resolution = resolution
		}
'''
    if "normalizedSize := normalizeAliVideoSize(req.Size)" not in text:
        text = replace_once(text, old_size_block, new_size_block, "Ali video x size normalization")

    native_estimate_branch = '''	if nativeRatios := a.dashScopeNativeBillingRatios(info, aliReq); len(nativeRatios) > 0 {
		return nativeRatios
	}
'''
    if native_estimate_branch.strip() not in text:
        text = replace_once(
            text,
            '''	otherRatios := map[string]float64{
		"seconds": float64(min(aliReq.Parameters.Duration, relaycommon.MaxTaskDurationSeconds)),
	}
	ratios, err := ProcessAliOtherRatios(aliReq)
''',
            '''	otherRatios := map[string]float64{
		"seconds": float64(min(aliReq.Parameters.Duration, relaycommon.MaxTaskDurationSeconds)),
	}
''' + native_estimate_branch + '''	ratios, err := ProcessAliOtherRatios(aliReq)
''',
            "Ali native video estimate billing",
        )
    write(rel, text)


def main() -> None:
    patch_endpoint_types()
    patch_endpoint_defaults()
    patch_model_capabilities()
    patch_advanced_custom_endpoints()
    patch_audio_pricing_meta()
    patch_dashscope_native_task_pricing()
    patch_ali_audio_adaptor()
    patch_channel_test_audio_default_voice()
    print("applied Ali video/audio endpoint and HTTP TTS backend patch")


if __name__ == "__main__":
    main()
