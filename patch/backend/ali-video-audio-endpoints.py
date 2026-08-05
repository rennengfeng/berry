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


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Ali video/audio endpoint patch failed: {label} anchor not found")
    return text.replace(old, new, 1)


def replace_once_regex(text: str, pattern: str, repl: str, label: str) -> str:
    new_text, count = re.subn(pattern, repl, text, count=1, flags=re.MULTILINE)
    if count == 0:
        raise SystemExit(f"Ali video/audio endpoint patch failed: {label} anchor not found")
    return new_text


def has_endpoint_type_const(text: str, name: str, value: str) -> bool:
    pattern = rf'^\s*{re.escape(name)}\s+EndpointType\s*=\s*"{re.escape(value)}"\s*$'
    return re.search(pattern, text, flags=re.MULTILINE) is not None


def has_endpoint_default(text: str, name: str) -> bool:
    pattern = rf'^\s*constant\.{re.escape(name)}\s*:'
    return re.search(pattern, text, flags=re.MULTILINE) is not None


def patch_endpoint_types() -> None:
    rel = "constant/endpoint_type.go"
    text = read(rel)
    has_video = has_endpoint_type_const(text, "EndpointTypeOpenAIVideo", "openai-video")
    has_audio = has_endpoint_type_const(text, "EndpointTypeAudioSpeech", "audio-speech")
    if not has_video:
        snippet = '\tEndpointTypeOpenAIVideo           EndpointType = "openai-video"\n'
        if not has_audio:
            snippet += '\tEndpointTypeAudioSpeech           EndpointType = "audio-speech"\n'
        text = ensure_after_regex(
            text,
            r'^\s*EndpointTypeEmbeddings\s+EndpointType\s*=\s*"embeddings"\s*\n',
            snippet,
            "endpoint type embeddings",
        )
    elif not has_audio:
        text = ensure_after_regex(
            text,
            r'^\s*EndpointTypeOpenAIVideo\s+EndpointType\s*=\s*"openai-video"\s*\n',
            '\tEndpointTypeAudioSpeech           EndpointType = "audio-speech"\n',
            "audio endpoint type",
        )
    write(rel, text)


def patch_endpoint_defaults() -> None:
    rel = "common/endpoint_defaults.go"
    text = read(rel)
    has_video = has_endpoint_default(text, "EndpointTypeOpenAIVideo")
    has_audio = has_endpoint_default(text, "EndpointTypeAudioSpeech")
    if not has_video:
        snippet = '\tconstant.EndpointTypeOpenAIVideo:           {Path: "/v1/videos", Method: "POST"},\n'
        if not has_audio:
            snippet += '\tconstant.EndpointTypeAudioSpeech:           {Path: "/v1/audio/speech", Method: "POST"},\n'
        text = ensure_after_regex(
            text,
            r'^\s*constant\.EndpointTypeEmbeddings\s*:\s*\{Path:\s*"/v1/embeddings",\s*Method:\s*"POST"\},\s*\n',
            snippet,
            "endpoint defaults embeddings",
        )
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
        text = ensure_after_regex(
            text,
            r'^\s*OpenAITextModels\s*=\s*\[\]string\s*\{(?:.|\n)*?^\s*\}\s*\n',
            '\tVideoGenerationModels = []string{\n'
            '\t\t"sora",\n\t\t"t2v",\n\t\t"i2v",\n\t\t"r2v",\n\t\t"kf2v",\n'
            '\t\t"video",\n\t\t"hailuo",\n\t\t"kling",\n\t\t"vidu",\n\t\t"happyhorse",\n\t\t"wan",\n\t}\n'
            '\tAudioSpeechModels = []string{\n\t\t"tts",\n\t\t"speech",\n\t\t"cosyvoice",\n\t\t"qwen-audio",\n\t}\n',
            "model capability lists",
        )
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
        has_video = re.search(r'advancedCustomEndpointPathOpenAIVideo\s*=', text) is not None
        has_audio = re.search(r'advancedCustomEndpointPathAudioSpeech\s*=', text) is not None
        if not has_video:
            snippet = '\tadvancedCustomEndpointPathOpenAIVideo            = "/v1/videos"\n'
            if not has_audio:
                snippet += '\tadvancedCustomEndpointPathAudioSpeech            = "/v1/audio/speech"\n'
            text = ensure_after_regex(
                text,
                r'^\s*advancedCustomEndpointPathImageGenerationAsync\s*=\s*"/v1/image-tasks/generations"\s*\n',
                snippet,
                f"{rel} image async advanced custom constant",
            )
        elif not has_audio:
            text = ensure_after_regex(
                text,
                r'^\s*advancedCustomEndpointPathOpenAIVideo\s*=\s*"/v1/videos"\s*\n',
                '\tadvancedCustomEndpointPathAudioSpeech            = "/v1/audio/speech"\n',
                f"{rel} audio advanced custom constant",
            )
        has_video_case = "case advancedCustomEndpointPathOpenAIVideo:" in text
        has_audio_case = "case advancedCustomEndpointPathAudioSpeech:" in text
        if not has_video_case and not has_audio_case:
            text = replace_once_regex(
                text,
                r'(case advancedCustomEndpointPathImageGeneration,\s*advancedCustomEndpointPathImageGenerationAsync:\s*\n\s*return constant\.EndpointTypeImageGeneration,\s*true\s*\n)',
                r'\g<1>'
                "case advancedCustomEndpointPathOpenAIVideo:\n\t\treturn constant.EndpointTypeOpenAIVideo, true\n"
                "case advancedCustomEndpointPathAudioSpeech:\n\t\treturn constant.EndpointTypeAudioSpeech, true\n",
                f"{rel} video/audio advanced custom switch",
            )
        elif not has_video_case:
            text = replace_once_regex(
                text,
                r'(case advancedCustomEndpointPathImageGeneration,\s*advancedCustomEndpointPathImageGenerationAsync:\s*\n\s*return constant\.EndpointTypeImageGeneration,\s*true\s*\n)',
                r'\g<1>'
                "case advancedCustomEndpointPathOpenAIVideo:\n\t\treturn constant.EndpointTypeOpenAIVideo, true\n",
                f"{rel} video advanced custom switch",
            )
        elif not has_audio_case:
            text = ensure_after_regex(
                text,
                r'^\s*case advancedCustomEndpointPathOpenAIVideo:\s*\n\s*return constant\.EndpointTypeOpenAIVideo,\s*true\s*\n',
                "case advancedCustomEndpointPathAudioSpeech:\n\t\treturn constant.EndpointTypeAudioSpeech, true\n",
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
	input := map[string]any{
		"text":        request.Input,
		"format":      normalizeAliTTSFormat(request.ResponseFormat),
		"sample_rate": defaultAliTTSSampleRate,
	}
	if strings.TrimSpace(request.Voice) != "" {
		input["voice"] = request.Voice
	}
	if request.Speed != nil {
		input["rate"] = *request.Speed
	}
	mergeAliTTSMetadata(input, request.Metadata)
	body, err := common.Marshal(map[string]any{"model": modelName, "input": input})
	if err != nil {
		return nil, fmt.Errorf("marshal Ali TTS request: %w", err)
	}
	return bytes.NewReader(body), nil
}

func normalizeAliTTSFormat(format string) string {
	switch strings.ToLower(strings.TrimSpace(format)) {
	case "wav", "pcm", "opus", "flac", "mp3":
		return strings.ToLower(strings.TrimSpace(format))
	default:
		return defaultAliTTSFormat
	}
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
	}
	audioBytes, contentType, err := resolveAliTTSAudio(c, info, aliResp)
	if err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeBadResponseBody, http.StatusBadGateway)
	}
	return writeAliTTSBytes(c, audioBytes, contentType, info)
}

func resolveAliTTSAudio(c *gin.Context, info *relaycommon.RelayInfo, response aliTTSResponse) ([]byte, string, error) {
	if strings.TrimSpace(response.Output.Audio.Data) != "" {
		decoded, err := base64.StdEncoding.DecodeString(response.Output.Audio.Data)
		if err != nil {
			decoded, err = base64.RawStdEncoding.DecodeString(response.Output.Audio.Data)
		}
		if err != nil {
			return nil, "", fmt.Errorf("decode Ali TTS audio data: %w", err)
		}
		return decoded, aliTTSContentType(info), nil
	}
	audioURL := strings.TrimSpace(response.Output.Audio.URL)
	if audioURL == "" {
		return nil, "", errors.New("Ali TTS response does not contain output.audio.url or output.audio.data")
	}
	parsed, err := url.Parse(audioURL)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return nil, "", errors.New("Ali TTS returned an invalid audio URL")
	}
	req, err := http.NewRequestWithContext(c.Request.Context(), http.MethodGet, audioURL, nil)
	if err != nil {
		return nil, "", fmt.Errorf("create Ali TTS audio download request: %w", err)
	}
	client, err := service.GetHttpClientWithProxy(info.ChannelSetting.Proxy)
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
    write("relay/channel/ali/audio.go", ALI_AUDIO_GO)
    rel = "relay/channel/ali/adaptor.go"
    text = read(rel)
    if "RelayModeAudioSpeech" not in text.split("case constant.RelayModeEmbeddings:", 1)[0]:
        text = replace_once(
            text,
            "\t\tcase constant.RelayModeEmbeddings:\n",
            '\t\tcase constant.RelayModeAudioSpeech:\n\t\t\tfullRequestURL = fmt.Sprintf("%s/api/v1/services/audio/tts/SpeechSynthesizer", info.ChannelBaseUrl)\n\t\tcase constant.RelayModeEmbeddings:\n',
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


def main() -> None:
    patch_endpoint_types()
    patch_endpoint_defaults()
    patch_model_capabilities()
    patch_advanced_custom_endpoints()
    patch_ali_audio_adaptor()
    print("applied Ali video/audio endpoint and HTTP TTS backend patch")


if __name__ == "__main__":
    main()
