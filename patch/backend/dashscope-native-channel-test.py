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
	requestPath, requestBody, err := buildDashScopeNativeTestRequest(testModel)
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

	info := newDashScopeNativeRelayInfo(c, testModel)
	info.InitChannelMeta(c)
	if info.ChannelType != constant.ChannelTypeAliDashScopeNative {
		err := fmt.Errorf("DashScope Native test requires channel type %s", constant.GetChannelTypeName(constant.ChannelTypeAliDashScopeNative))
		return testResult{context: c, localErr: err, newAPIError: types.NewError(err, types.ErrorCodeInvalidApiType)}
	}
	preparedBody := prepareDashScopeNativeMediaRequest(c, requestBody)
	info.PriceData.GroupRatioInfo = helper.HandleGroupRatio(c, info)
	charge, err := calculateDashScopeNativeCharge(info, preparedBody)
	if err != nil {
		return testResult{context: c, localErr: err, newAPIError: types.NewError(err, types.ErrorCodeModelPriceError, types.ErrOptionWithStatusCode(http.StatusBadRequest))}
	}
	info.PriceData.Quota = charge.Quota
	info.PriceData.ModelPrice = charge.PriceUSD
	info.PriceData.UsePrice = true

	common.SysLog(fmt.Sprintf("testing DashScope Native channel %d with model %s via %s", channel.Id, testModel, requestPath))
	resp, err := doDashScopeNativeHTTPRequest(c, info, bytes.NewReader(preparedBody))
	if err != nil {
		return testResult{context: c, localErr: err, newAPIError: types.NewOpenAIError(err, types.ErrorCodeDoRequestFailed, http.StatusInternalServerError)}
	}
	defer service.CloseResponseBodyGracefully(resp)

	respBody, readErr := io.ReadAll(resp.Body)
	if readErr != nil {
		return testResult{context: c, localErr: readErr, newAPIError: types.NewOpenAIError(readErr, types.ErrorCodeReadResponseBodyFailed, http.StatusInternalServerError)}
	}
	if resp.StatusCode >= http.StatusBadRequest {
		err := detectDashScopeNativeTestResponseError(respBody)
		if err == nil {
			err = fmt.Errorf("bad response status code %d, body: %s", resp.StatusCode, strings.TrimSpace(string(respBody)))
		}
		common.SysError(fmt.Sprintf(
			"DashScope Native channel test bad response: channel_id=%d name=%s model=%s path=%s status=%d err=%v",
			channel.Id,
			channel.Name,
			testModel,
			requestPath,
			resp.StatusCode,
			err,
		))
		return testResult{context: c, localErr: err, newAPIError: types.NewOpenAIError(err, types.ErrorCodeBadResponse, http.StatusInternalServerError)}
	}
	if bodyErr := validateDashScopeNativeTestResponse(c, info, requestPath, respBody); bodyErr != nil {
		return testResult{context: c, localErr: bodyErr, newAPIError: types.NewOpenAIError(bodyErr, types.ErrorCodeBadResponseBody, http.StatusInternalServerError)}
	}
	info.PriceData.AddOtherRatio("native_quantity", charge.Quantity)
	model.RecordConsumeLog(c, testUserID, model.RecordConsumeLogParams{
		ChannelId:  channel.Id,
		ModelName:  info.OriginModelName,
		TokenName:  "模型测试",
		Quota:      charge.Quota,
		Content:    "DashScope Native 模型测试",
		TokenId:    info.TokenId,
		Group:      info.UsingGroup,
		Other:      map[string]interface{}{"is_channel_test": true, "request_path": requestPath, "native_unit": charge.Unit, "native_quantity": charge.Quantity, "model_price": charge.PriceUSD},
	})
	common.SysLog(fmt.Sprintf("testing DashScope Native channel #%d, response: \n%s", channel.Id, common.LocalLogPreview(string(respBody))))
	return testResult{context: c}
}

func buildDashScopeNativeTestRequest(modelName string) (string, []byte, error) {
	modelName = strings.TrimSpace(modelName)
	if modelName == "" {
		return "", nil, errors.New("model is required")
	}
	normalized := strings.ToLower(modelName)
	if strings.Contains(normalized, "cosyvoice") || strings.Contains(normalized, "qwen-audio") {
		body, err := json.Marshal(map[string]any{
			"model": modelName,
			"input": map[string]any{
				"text":        "你好，这是连通性测试。",
				"voice":       "longxiaochun",
				"format":      "wav",
				"sample_rate": 24000,
			},
		})
		return "/api/v1/services/audio/tts/SpeechSynthesizer", body, err
	}
	if isDashScopeNativeRealtimeTestModel(normalized) {
		return "", nil, fmt.Errorf("DashScope Native model %q uses realtime/WebSocket protocol and is not supported by automatic HTTP channel test; please test it with a realtime client request", modelName)
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
		return "/api/v1/services/aigc/multimodal-generation/generation", body, err
	}
	if isDashScopeNativeVideoEditTestModel(normalized) {
		return "", nil, fmt.Errorf("DashScope Native model %q requires a real edit source video/image and is not supported by automatic channel test", modelName)
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
		return "/api/v1/services/aigc/video-generation/video-synthesis", body, err
	}
	body, err := json.Marshal(map[string]any{
		"model": modelName,
		"input": map[string]any{
			"prompt": "hi",
		},
	})
	return "/api/v1/services/aigc/multimodal-generation/generation", body, err
}

func isDashScopeNativeRealtimeTestModel(normalizedModelName string) bool {
	return strings.Contains(normalizedModelName, "tts") ||
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

func validateDashScopeNativeTestResponse(c *gin.Context, info *relaycommon.RelayInfo, requestPath string, respBody []byte) error {
	if bodyErr := detectDashScopeNativeTestResponseError(respBody); bodyErr != nil {
		return bodyErr
	}
	normalizedPath := strings.ToLower(requestPath)
	if taskID := strings.TrimSpace(gjson.GetBytes(respBody, "output.task_id").String()); taskID != "" {
		return pollDashScopeNativeTestTask(c, info, taskID, 150*time.Second)
	}
	if strings.Contains(normalizedPath, "/multimodal-generation/") {
		if dashScopeNativeTestHasResultURL(respBody) {
			return nil
		}
		return fmt.Errorf("DashScope Native image test response does not contain generated image URL, body: %s", common.LocalLogPreview(string(respBody)))
	}
	if strings.Contains(normalizedPath, "/video-generation/") {
		return fmt.Errorf("DashScope Native async video test response did not include output.task_id, body: %s", common.LocalLogPreview(string(respBody)))
	}
	if strings.Contains(normalizedPath, "/audio/tts/") || strings.Contains(normalizedPath, "/speechsynthesizer") {
		if len(bytes.TrimSpace(respBody)) > 0 && !gjson.ValidBytes(respBody) {
			return nil
		}
		if dashScopeNativeTestHasResultURL(respBody) {
			return nil
		}
		return fmt.Errorf("DashScope Native TTS test response does not contain generated audio URL, body: %s", common.LocalLogPreview(string(respBody)))
	}
	return validateTestResponseBody(respBody, false)
}

func pollDashScopeNativeTestTask(c *gin.Context, info *relaycommon.RelayInfo, taskID string, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	lastStatus := ""
	for {
		respBody, err := fetchDashScopeNativeTestTask(c, info, taskID)
		if err != nil {
			return err
		}
		if bodyErr := detectDashScopeNativeTestResponseError(respBody); bodyErr != nil {
			return bodyErr
		}
		status := strings.ToUpper(strings.TrimSpace(gjson.GetBytes(respBody, "output.task_status").String()))
		if status == "" {
			status = strings.ToUpper(strings.TrimSpace(gjson.GetBytes(respBody, "task_status").String()))
		}
		lastStatus = status
		switch status {
		case "SUCCEEDED":
			if dashScopeNativeTestHasResultURL(respBody) {
				return nil
			}
			return fmt.Errorf("DashScope Native async task %s succeeded but no result URL was returned, body: %s", taskID, common.LocalLogPreview(string(respBody)))
		case "FAILED", "CANCELED", "UNKNOWN":
			message := strings.TrimSpace(gjson.GetBytes(respBody, "output.message").String())
			if message == "" {
				message = strings.TrimSpace(gjson.GetBytes(respBody, "message").String())
			}
			if message == "" {
				message = common.LocalLogPreview(string(respBody))
			}
			return fmt.Errorf("DashScope Native async task %s ended with status %s: %s", taskID, status, message)
		}
		if time.Now().After(deadline) {
			if lastStatus == "" {
				lastStatus = "UNKNOWN"
			}
			return fmt.Errorf("DashScope Native async task %s is still %s after %.0f seconds; channel test is not marked successful until the real result URL is returned", taskID, lastStatus, timeout.Seconds())
		}
		select {
		case <-c.Request.Context().Done():
			return c.Request.Context().Err()
		case <-time.After(5 * time.Second):
		}
	}
}

func fetchDashScopeNativeTestTask(c *gin.Context, info *relaycommon.RelayInfo, taskID string) ([]byte, error) {
	previousMethod := c.Request.Method
	c.Request.Method = http.MethodGet
	resp, err := doDashScopeNativeHTTPRequest(c, info, nil, "/api/v1/tasks/"+taskID)
	c.Request.Method = previousMethod
	if err != nil {
		return nil, err
	}
	defer service.CloseResponseBodyGracefully(resp)
	respBody, readErr := io.ReadAll(resp.Body)
	if readErr != nil {
		return nil, readErr
	}
	if resp.StatusCode >= http.StatusBadRequest {
		if bodyErr := detectDashScopeNativeTestResponseError(respBody); bodyErr != nil {
			return nil, bodyErr
		}
		return nil, fmt.Errorf("DashScope Native async task poll bad response status code %d, body: %s", resp.StatusCode, strings.TrimSpace(string(respBody)))
	}
	return respBody, nil
}

func dashScopeNativeTestHasResultURL(respBody []byte) bool {
	paths := []string{
		"output.video_url",
		"output.audio.url",
		"output.audio.data",
		"output.url",
		"output.image_url",
		"output.results.0.url",
		"output.results.0.video_url",
		"output.results.0.image",
		"output.choices.0.message.content.0.image",
		"data.0.url",
	}
	for _, path := range paths {
		if strings.TrimSpace(gjson.GetBytes(respBody, path).String()) != "" {
			return true
		}
	}
	return false
}

func detectDashScopeNativeTestResponseError(respBody []byte) error {
	if err := detectErrorFromTestResponseBody(respBody); err != nil {
		return err
	}
	b := bytes.TrimSpace(respBody)
	if len(b) == 0 || (b[0] != '{' && b[0] != '[') {
		return nil
	}
	message := strings.TrimSpace(gjson.GetBytes(b, "message").String())
	if message == "" {
		message = strings.TrimSpace(gjson.GetBytes(b, "output.message").String())
	}
	code := strings.TrimSpace(gjson.GetBytes(b, "code").String())
	if code == "" {
		code = strings.TrimSpace(gjson.GetBytes(b, "output.code").String())
	}
	if gjson.GetBytes(b, "output").Exists() || gjson.GetBytes(b, "data").Exists() {
		return nil
	}
	if message == "" {
		return nil
	}
	if code != "" {
		return fmt.Errorf("upstream error %s: %s", code, message)
	}
	return fmt.Errorf("upstream error: %s", message)
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
