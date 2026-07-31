#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path


ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
TARGET = ROOT / "controller" / "channel-test.go"


def read() -> str:
    if not TARGET.exists():
        raise SystemExit("DashScope Native channel test patch failed: missing controller/channel-test.go")
    return TARGET.read_text(encoding="utf-8")


def write(text: str) -> None:
    TARGET.write_text(text, encoding="utf-8")


def patch_entry(text: str) -> str:
    marker = "return testDashScopeNativeChannel(ctx, channel, testUserID, testModel)"
    if marker in text:
        return text
    anchor = "\n\tendpointType = normalizeChannelTestEndpoint(channel, testModel, endpointType)\n"
    if anchor not in text:
        raise SystemExit("DashScope Native channel test patch failed: endpoint normalize anchor not found")
    insert = (
        "\n\tif channel.Type == constant.ChannelTypeAliDashScopeNative {\n"
        "\t\treturn testDashScopeNativeChannel(ctx, channel, testUserID, testModel)\n"
        "\t}\n"
    )
    return text.replace(anchor, insert + anchor, 1)


def patch_helper(text: str) -> str:
    if "func testDashScopeNativeChannel(" in text:
        return text
    anchor = "\nfunc attachTestBillingRequestInput(info *relaycommon.RelayInfo, request dto.Request) error {\n"
    if anchor not in text:
        raise SystemExit("DashScope Native channel test patch failed: billing input helper anchor not found")
    helper = r'''
func testDashScopeNativeChannel(ctx context.Context, channel *model.Channel, testUserID int, testModel string) testResult {
	if ctx == nil {
		ctx = context.Background()
	}
	requestPath, requestBody, configOnly, err := buildDashScopeNativeTestRequest(testModel)
	if err != nil {
		return testResult{localErr: err, newAPIError: types.NewError(err, types.ErrorCodeInvalidRequest)}
	}

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequestWithContext(ctx, http.MethodPost, requestPath, bytes.NewReader(requestBody))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Request.Header.Set("Accept", "application/json")

	cache, err := model.GetUserCache(testUserID)
	if err != nil {
		return testResult{context: c, localErr: err}
	}
	cache.WriteContext(c)
	c.Set("id", testUserID)
	common.SetContextKey(c, constant.ContextKeyUserId, testUserID)
	group, _ := model.GetUserGroup(testUserID, false)
	c.Set("group", group)
	common.SetContextKey(c, constant.ContextKeyUsingGroup, group)

	if newAPIError := middleware.SetupContextForSelectedChannel(c, channel, testModel); newAPIError != nil {
		return testResult{context: c, localErr: newAPIError, newAPIError: newAPIError}
	}

	if configOnly {
		info := newDashScopeNativeRelayInfo(c, testModel)
		info.InitChannelMeta(c)
		if info.ChannelType != constant.ChannelTypeAliDashScopeNative {
			err := fmt.Errorf("DashScope Native test requires channel type %s", constant.GetChannelTypeName(constant.ChannelTypeAliDashScopeNative))
			return testResult{context: c, localErr: err, newAPIError: types.NewError(err, types.ErrorCodeInvalidApiType)}
		}
		info.PriceData.GroupRatioInfo = helper.HandleGroupRatio(c, info)
		if _, err := calculateDashScopeNativeCharge(info, requestBody); err != nil {
			return testResult{context: c, localErr: err, newAPIError: types.NewError(err, types.ErrorCodeModelPriceError, types.ErrOptionWithStatusCode(http.StatusBadRequest))}
		}
		common.SysLog(fmt.Sprintf("testing DashScope Native channel %d with realtime/config-only model %s", channel.Id, testModel))
		return testResult{context: c}
	}

	common.SysLog(fmt.Sprintf("testing DashScope Native channel %d with model %s via %s", channel.Id, testModel, requestPath))
	RelayDashScopeNative(c)

	result := w.Result()
	respBody, readErr := readTestResponseBody(result.Body, false)
	if readErr != nil {
		return testResult{context: c, localErr: readErr, newAPIError: types.NewOpenAIError(readErr, types.ErrorCodeReadResponseBodyFailed, http.StatusInternalServerError)}
	}
	if result.StatusCode >= http.StatusBadRequest {
		err := detectErrorFromTestResponseBody(respBody)
		if err == nil {
			err = fmt.Errorf("bad response status code %d, body: %s", result.StatusCode, strings.TrimSpace(string(respBody)))
		}
		common.SysError(fmt.Sprintf(
			"DashScope Native channel test bad response: channel_id=%d name=%s model=%s path=%s status=%d err=%v",
			channel.Id,
			channel.Name,
			testModel,
			requestPath,
			result.StatusCode,
			err,
		))
		return testResult{context: c, localErr: err, newAPIError: types.NewOpenAIError(err, types.ErrorCodeBadResponse, http.StatusInternalServerError)}
	}
	if bodyErr := validateTestResponseBody(respBody, false); bodyErr != nil {
		return testResult{context: c, localErr: bodyErr, newAPIError: types.NewOpenAIError(bodyErr, types.ErrorCodeBadResponseBody, http.StatusInternalServerError)}
	}
	common.SysLog(fmt.Sprintf("testing DashScope Native channel #%d, response: \n%s", channel.Id, common.LocalLogPreview(string(respBody))))
	return testResult{context: c}
}

func buildDashScopeNativeTestRequest(modelName string) (string, []byte, bool, error) {
	modelName = strings.TrimSpace(modelName)
	if modelName == "" {
		return "", nil, false, errors.New("model is required")
	}
	normalized := strings.ToLower(modelName)
	if isDashScopeNativeRealtimeTestModel(normalized) {
		body, err := json.Marshal(map[string]any{
			"model": modelName,
			"input": map[string]any{
				"text": "你好，这是连通性测试。",
			},
			"parameters": map[string]any{
				"format": "mp3",
			},
		})
		return "/api-ws/v1/inference?model=" + modelName, body, true, err
	}
	if strings.Contains(normalized, "qwen-image") || strings.Contains(normalized, "wan2.7-image") {
		body, err := json.Marshal(map[string]any{
			"model": modelName,
			"input": map[string]any{
				"messages": []map[string]any{
					{
						"role": "user",
						"content": []map[string]string{
							{"text": "a cute cat"},
						},
					},
				},
			},
			"parameters": map[string]any{
				"n":             1,
				"prompt_extend": false,
				"watermark":     false,
				"size":          "1024*1024",
				"result_format": "url",
			},
		})
		return "/api/v1/services/aigc/image-generation/generation", body, false, err
	}
	if isDashScopeNativeVideoEditTestModel(normalized) {
		body, err := json.Marshal(map[string]any{
			"model": modelName,
			"input": map[string]any{
				"prompt": "make it cinematic",
			},
			"parameters": map[string]any{
				"resolution": "720P",
				"ratio":      "16:9",
				"duration":   5,
			},
		})
		return "/api/v1/services/aigc/video-generation/video-synthesis", body, true, err
	}
	if isDashScopeNativeVideoTestModel(normalized) {
		input := map[string]any{
			"prompt": "a cat walking on grass",
		}
		if isDashScopeNativeImageToVideoTestModel(normalized) {
			input["image_url"] = "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20250925/fpakfo/image36.webp"
			input["media"] = []map[string]string{
				{
					"type": "reference_image",
					"url":  "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20250925/fpakfo/image36.webp",
				},
			}
		}
		body, err := json.Marshal(map[string]any{
			"model": modelName,
			"input": input,
			"parameters": map[string]any{
				"resolution":    "720P",
				"ratio":         "16:9",
				"duration":      5,
				"result_format": "url",
			},
		})
		return "/api/v1/services/aigc/video-generation/video-synthesis", body, false, err
	}
	body, err := json.Marshal(map[string]any{
		"model": modelName,
		"input": map[string]any{
			"prompt": "hi",
		},
	})
	return "/api/v1/services/aigc/multimodal-generation/generation", body, false, err
}

func isDashScopeNativeRealtimeTestModel(normalizedModelName string) bool {
	return strings.Contains(normalizedModelName, "cosyvoice") ||
		strings.Contains(normalizedModelName, "qwen-audio") ||
		strings.Contains(normalizedModelName, "tts") ||
		strings.Contains(normalizedModelName, "realtime")
}

func isDashScopeNativeVideoTestModel(normalizedModelName string) bool {
	return strings.Contains(normalizedModelName, "t2v") ||
		strings.Contains(normalizedModelName, "i2v") ||
		strings.Contains(normalizedModelName, "r2v") ||
		strings.Contains(normalizedModelName, "kf2v") ||
		strings.Contains(normalizedModelName, "video")
}

func isDashScopeNativeImageToVideoTestModel(normalizedModelName string) bool {
	return strings.Contains(normalizedModelName, "i2v") ||
		strings.Contains(normalizedModelName, "r2v") ||
		strings.Contains(normalizedModelName, "kf2v")
}

func isDashScopeNativeVideoEditTestModel(normalizedModelName string) bool {
	return strings.Contains(normalizedModelName, "video-edit")
}

'''
    return text.replace(anchor, "\n" + helper + anchor, 1)


def main() -> None:
    text = read()
    text = patch_entry(text)
    text = patch_helper(text)
    write(text)
    print("applied DashScope Native channel test backend patch")


if __name__ == "__main__":
    main()
