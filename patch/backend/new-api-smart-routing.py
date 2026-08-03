#!/usr/bin/env python3
from pathlib import Path
import re
import shutil
import subprocess
import sys


ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()


def read(rel: str) -> str:
    path = ROOT / rel
    if not path.exists():
        raise SystemExit(f"smart routing patch failed: missing {rel}")
    return path.read_text(encoding="utf-8")


def exists(rel: str) -> bool:
    return (ROOT / rel).exists()


def write(rel: str, text: str) -> None:
    path = ROOT / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def replace_once(rel: str, old: str, new: str, label: str) -> None:
    text = read(rel)
    if new in text:
        return
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"smart routing patch failed: {label} matched {count} anchors in {rel}")
    write(rel, text.replace(old, new, 1))


def insert_after(rel: str, anchor: str, snippet: str, marker: str, label: str) -> None:
    text = read(rel)
    if marker in text:
        return
    if anchor not in text:
        raise SystemExit(f"smart routing patch failed: {label} anchor not found in {rel}")
    write(rel, text.replace(anchor, anchor + snippet, 1))


def patch_import(rel: str, import_line: str, after_line: str, label: str) -> None:
    text = read(rel)
    if import_line in text:
        return
    anchor = after_line + "\n"
    if anchor not in text:
        raise SystemExit(f"smart routing patch failed: {label} import anchor not found in {rel}")
    write(rel, text.replace(anchor, anchor + "\t" + import_line + "\n", 1))


def regex_replace(rel: str, pattern: str, repl: str, marker: str, label: str) -> None:
    text = read(rel)
    if marker in text:
        return
    new_text, count = re.subn(pattern, repl, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"smart routing patch failed: {label} matched {count} anchors in {rel}")
    write(rel, new_text)


def insert_token_model_helpers() -> None:
    text = read("model/token.go")
    if "func NormalizeTokenRoutingStrategy" in text:
        return
    snippets = []
    if "func NormalizeTokenGroupList" not in text:
        snippets.append("""

func NormalizeTokenGroupList(groups []string) []string {
\tnormalized := make([]string, 0, len(groups))
\tseen := make(map[string]bool, len(groups))
\tfor _, group := range groups {
\t\tgroup = strings.TrimSpace(group)
\t\tif group == "" || seen[group] {
\t\t\tcontinue
\t\t}
\t\tseen[group] = true
\t\tnormalized = append(normalized, group)
\t}
\treturn normalized
}

func SplitTokenGroups(group string) []string {
\tif strings.TrimSpace(group) == "" {
\t\treturn nil
\t}
\treturn NormalizeTokenGroupList(strings.Split(group, ","))
}

func JoinTokenGroups(groups []string) string {
\treturn strings.Join(NormalizeTokenGroupList(groups), ",")
\t}
""")
    snippets.append("""

const (
\tTokenRoutingManual      = ""
\tTokenRoutingSmartAuto   = "auto"
\tTokenRoutingPrice       = "price"
\tTokenRoutingSpeed       = "speed"
\tTokenRoutingSuccessRate = "success_rate"
)

func NormalizeTokenRoutingStrategy(strategy string) string {
\tswitch strings.TrimSpace(strategy) {
\tcase TokenRoutingSmartAuto, TokenRoutingPrice, TokenRoutingSpeed, TokenRoutingSuccessRate:
\t\treturn strings.TrimSpace(strategy)
\tdefault:
\t\treturn TokenRoutingManual
\t}
}

func (token *Token) GetRoutingStrategy() string {
\tif token == nil {
\t\treturn TokenRoutingManual
\t}
\treturn NormalizeTokenRoutingStrategy(token.RoutingStrategy)
}
""")
    snippet = "\n".join(snippets)
    anchors = [
        "func GetAllUserTokens(userId int, startIdx int, num int) ([]*Token, error) {\n",
        "func SearchUserTokens(userId int, keyword string, token string, offset int, limit int) (tokens []*Token, total int64, err error) {\n",
    ]
    for anchor in anchors:
        if anchor in text:
            write("model/token.go", text.replace(anchor, snippet + "\n" + anchor, 1))
            return
    raise SystemExit("smart routing patch failed: token routing strategy helpers anchor not found in model/token.go")


def patch_context_keys() -> None:
    insert_after(
        "constant/context_key.go",
        '\tContextKeyTokenGroup             ContextKey = "token_group"\n',
        '\tContextKeyTokenAllowedGroups     ContextKey = "token_allowed_groups"\n',
        "ContextKeyTokenAllowedGroups",
        "token allowed groups context key",
    )
    insert_after(
        "constant/context_key.go",
        '\tContextKeyTokenCrossGroupRetry   ContextKey = "token_cross_group_retry"\n',
        '\tContextKeyTokenRoutingStrategy   ContextKey = "token_routing_strategy"\n'
        '\tContextKeyRequestedGroup         ContextKey = "requested_group"\n'
        '\tContextKeySmartRouteTriedGroups  ContextKey = "smart_route_tried_groups"\n',
        "ContextKeyTokenRoutingStrategy",
        "context keys",
    )


def patch_token_model() -> None:
    insert_after(
        "model/token.go",
        '\tGroup              string         `json:"group" gorm:"default:\'\'"`\n',
        '\tRoutingStrategy    string         `json:"routing_strategy" gorm:"type:varchar(32);default:\'\'"`\n',
        "RoutingStrategy    string",
        "token routing_strategy field",
    )
    insert_token_model_helpers()
    patch_token_update_fields()


def patch_token_update_fields() -> None:
    rel = "model/token.go"
    text = read(rel)
    pattern = r"DB\.Model\(token\)\.Select\((?P<fields>.*?)\)\.Updates\(token\)\.Error"
    match = re.search(pattern, text, flags=re.S)
    if not match:
        raise SystemExit("smart routing patch failed: token update Select fields anchor not found in model/token.go")
    fields = match.group("fields")
    if '"routing_strategy"' in fields:
        return
    if '"cross_group_retry"' in fields:
        next_fields = fields.replace('"cross_group_retry"', '"routing_strategy", "cross_group_retry"', 1)
    else:
        next_fields = fields.rstrip() + ',\n\t\t"routing_strategy"'
    write(rel, text[: match.start("fields")] + next_fields + text[match.end("fields") :])


def patch_token_controller() -> None:
    text = read("controller/token.go")
    if "routingStrategy := model.NormalizeTokenRoutingStrategy(token.RoutingStrategy)\n\tcleanToken := model.Token{" not in text:
        if "\ttokenGroups := model.SplitTokenGroups(token.Group)\n\ttokenGroup := model.JoinTokenGroups(tokenGroups)\n\tcleanToken := model.Token{" in text:
            text = text.replace(
                "\ttokenGroups := model.SplitTokenGroups(token.Group)\n\ttokenGroup := model.JoinTokenGroups(tokenGroups)\n\tcleanToken := model.Token{",
                "\ttokenGroups := model.SplitTokenGroups(token.Group)\n\ttokenGroup := model.JoinTokenGroups(tokenGroups)\n\troutingStrategy := model.NormalizeTokenRoutingStrategy(token.RoutingStrategy)\n\tcleanToken := model.Token{",
                1,
            )
        elif "\tcleanToken := model.Token{" in text:
            text = text.replace(
                "\tcleanToken := model.Token{",
                "\ttokenGroups := model.SplitTokenGroups(token.Group)\n\ttokenGroup := model.JoinTokenGroups(tokenGroups)\n\troutingStrategy := model.NormalizeTokenRoutingStrategy(token.RoutingStrategy)\n\tcleanToken := model.Token{",
                1,
            )
        else:
            raise SystemExit("smart routing patch failed: add token routing normalization anchor not found in controller/token.go")
        write("controller/token.go", text)
    text = read("controller/token.go")
    if "\t\tRoutingStrategy:    routingStrategy,\n" not in text:
        if "\t\tGroup:              tokenGroup,\n" in text:
            text = text.replace(
                "\t\tGroup:              tokenGroup,\n",
                "\t\tGroup:              tokenGroup,\n\t\tRoutingStrategy:    routingStrategy,\n",
                1,
            )
        elif "\t\tGroup:              token.Group,\n" in text:
            text = text.replace(
                "\t\tGroup:              token.Group,\n",
                "\t\tGroup:              tokenGroup,\n\t\tRoutingStrategy:    routingStrategy,\n",
                1,
            )
        else:
            raise SystemExit("smart routing patch failed: add token routing create field anchor not found in controller/token.go")
        write("controller/token.go", text)
    text = read("controller/token.go")
    if "cleanToken.RoutingStrategy = model.NormalizeTokenRoutingStrategy(token.RoutingStrategy)" not in text:
        if "\t\tcleanToken.Group = model.JoinTokenGroups(tokenGroups)\n" in text:
            text = text.replace(
                "\t\tcleanToken.Group = model.JoinTokenGroups(tokenGroups)\n",
                "\t\tcleanToken.Group = model.JoinTokenGroups(tokenGroups)\n\t\tcleanToken.RoutingStrategy = model.NormalizeTokenRoutingStrategy(token.RoutingStrategy)\n",
                1,
            )
        elif "\t\tcleanToken.Group = token.Group\n" in text:
            text = text.replace(
                "\t\tcleanToken.Group = token.Group\n",
                "\t\ttokenGroups := model.SplitTokenGroups(token.Group)\n\t\tcleanToken.Group = model.JoinTokenGroups(tokenGroups)\n\t\tcleanToken.RoutingStrategy = model.NormalizeTokenRoutingStrategy(token.RoutingStrategy)\n",
                1,
            )
        else:
            raise SystemExit("smart routing patch failed: add token routing update field anchor not found in controller/token.go")
        write("controller/token.go", text)


def patch_auth() -> None:
    text = read("middleware/auth.go")
    if "ContextKeyTokenRoutingStrategy" not in text:
        if "\tcommon.SetContextKey(c, constant.ContextKeyTokenGroup, token.Group)\n\tcommon.SetContextKey(c, constant.ContextKeyTokenCrossGroupRetry, token.CrossGroupRetry)\n" in text:
            text = text.replace(
                "\tcommon.SetContextKey(c, constant.ContextKeyTokenGroup, token.Group)\n\tcommon.SetContextKey(c, constant.ContextKeyTokenCrossGroupRetry, token.CrossGroupRetry)\n",
                "\ttokenGroups := model.SplitTokenGroups(token.Group)\n\ttokenGroup := model.JoinTokenGroups(tokenGroups)\n\tcommon.SetContextKey(c, constant.ContextKeyTokenGroup, tokenGroup)\n\tif len(tokenGroups) > 0 {\n\t\tcommon.SetContextKey(c, constant.ContextKeyTokenAllowedGroups, tokenGroups)\n\t}\n\troutingStrategy := token.GetRoutingStrategy()\n\tcommon.SetContextKey(c, constant.ContextKeyTokenRoutingStrategy, routingStrategy)\n\tcommon.SetContextKey(c, constant.ContextKeyTokenCrossGroupRetry, token.CrossGroupRetry)\n",
                1,
            )
            write("middleware/auth.go", text)
        else:
            insert_after(
                "middleware/auth.go",
                '\t\tcommon.SetContextKey(c, constant.ContextKeyTokenAllowedGroups, tokenGroups)\n',
                '\t}\n\troutingStrategy := token.GetRoutingStrategy()\n'
                '\tcommon.SetContextKey(c, constant.ContextKeyTokenRoutingStrategy, routingStrategy)\n',
                "ContextKeyTokenRoutingStrategy",
                "token routing context",
            )
            text = read("middleware/auth.go")
    broken = (
        "\tif len(tokenGroups) > 0 {\n"
        "\t\tcommon.SetContextKey(c, constant.ContextKeyTokenAllowedGroups, tokenGroups)\n"
        "\t}\n\troutingStrategy := token.GetRoutingStrategy()\n"
        "\tcommon.SetContextKey(c, constant.ContextKeyTokenRoutingStrategy, routingStrategy)\n"
        "\t}\n"
    )
    fixed = (
        "\tif len(tokenGroups) > 0 {\n"
        "\t\tcommon.SetContextKey(c, constant.ContextKeyTokenAllowedGroups, tokenGroups)\n"
        "\t}\n\troutingStrategy := token.GetRoutingStrategy()\n"
        "\tcommon.SetContextKey(c, constant.ContextKeyTokenRoutingStrategy, routingStrategy)\n"
    )
    if broken in text:
        write("middleware/auth.go", text.replace(broken, fixed, 1))


def patch_distributor() -> None:
    text = read("middleware/distributor.go")
    if "ContextKeyRequestedGroup" not in text:
        if "\t\t\t\tusingGroup := common.GetContextKeyString(c, constant.ContextKeyUsingGroup)\n" in text:
            text = text.replace(
                "\t\t\t\tusingGroup := common.GetContextKeyString(c, constant.ContextKeyUsingGroup)\n",
                "\t\t\t\tusingGroup := common.GetContextKeyString(c, constant.ContextKeyUsingGroup)\n\t\t\t\tcommon.SetContextKey(c, constant.ContextKeyRequestedGroup, \"\")\n",
                1,
            )
            text = text.replace(
                "\t\t\t\t\t\tusingGroup = playgroundRequest.Group\n\t\t\t\t\t\tcommon.SetContextKey(c, constant.ContextKeyUsingGroup, usingGroup)\n",
                "\t\t\t\t\t\tusingGroup = playgroundRequest.Group\n\t\t\t\t\t\tcommon.SetContextKey(c, constant.ContextKeyUsingGroup, usingGroup)\n\t\t\t\t\t\tcommon.SetContextKey(c, constant.ContextKeyRequestedGroup, usingGroup)\n",
                1,
            )
            write("middleware/distributor.go", text)
        else:
            insert_after(
                "middleware/distributor.go",
                "\tcommon.SetContextKey(c, constant.ContextKeyUsingGroup, requestedGroup)\n\tcommon.SetContextKey(c, constant.ContextKeyTokenGroup, requestedGroup)\n",
                "\tcommon.SetContextKey(c, constant.ContextKeyRequestedGroup, requestedGroup)\n"
                "\tcommon.SetContextKey(c, constant.ContextKeyTokenRoutingStrategy, \"\")\n",
                "ContextKeyRequestedGroup",
                "requested group context",
            )
            text = read("middleware/distributor.go")
    marker = "routeHasMultipleCandidates"
    if marker not in text:
        old = '\t\t\t\tif preferredChannelID, found := service.GetPreferredChannelByAffinity(c, modelRequest.Model, usingGroup); found {\n'
        new = (
            '\t\t\t\trouteHasMultipleCandidates := common.GetContextKeyString(c, constant.ContextKeyTokenRoutingStrategy) != "" ||\n'
            '\t\t\t\t\t(common.GetContextKeyString(c, constant.ContextKeyRequestedGroup) == "" && len(common.GetContextKeyStringSlice(c, constant.ContextKeyTokenAllowedGroups)) > 1)\n'
            '\t\t\t\tif !routeHasMultipleCandidates {\n'
            '\t\t\t\t\tif preferredChannelID, found := service.GetPreferredChannelByAffinity(c, modelRequest.Model, usingGroup); found {\n'
        )
        if old not in text:
            raise SystemExit("smart routing patch failed: channel affinity anchor not found in middleware/distributor.go")
        text = text.replace(old, new, 1)
        old2 = "\n\t\t\t\tif channel == nil {\n"
        new2 = "\n\t\t\t\t}\n\n\t\t\t\tif channel == nil {\n"
        idx = text.find(old2, text.find(marker))
        if idx < 0:
            raise SystemExit("smart routing patch failed: channel affinity close anchor not found in middleware/distributor.go")
        text = text[:idx] + new2 + text[idx + len(old2):]
        write("middleware/distributor.go", text)


def patch_relay() -> None:
    replace_once(
        "controller/relay.go",
        "\tchannel, selectGroup, err := service.CacheGetRandomSatisfiedChannel(retryParam)\n\n\tinfo.PriceData.GroupRatioInfo = helper.HandleGroupRatio(c, info)\n",
        "\tchannel, selectGroup, err := service.CacheGetRandomSatisfiedChannel(retryParam)\n\tif selectGroup != \"\" {\n\t\tinfo.UsingGroup = selectGroup\n\t\tinfo.TokenGroup = selectGroup\n\t\tcommon.SetContextKey(c, constant.ContextKeyUsingGroup, selectGroup)\n\t\tcommon.SetContextKey(c, constant.ContextKeyTokenGroup, selectGroup)\n\t}\n\n\tinfo.PriceData.GroupRatioInfo = helper.HandleGroupRatio(c, info)\n",
        "relay selected group sync",
    )


def patch_model_list() -> None:
    text = read("controller/model.go")
    if "tokenAllowedGroups := common.GetContextKeyStringSlice(c, constant.ContextKeyTokenAllowedGroups)" in text:
        return

    latest_anchor = "\n\tif tokenGroup == \"auto\" {\n"
    if "func getModelListGroups(c *gin.Context) (modelListGroups, error) {" in text and latest_anchor in text:
        snippet = """
\ttokenAllowedGroups := common.GetContextKeyStringSlice(c, constant.ContextKeyTokenAllowedGroups)
\tif common.GetContextKeyString(c, constant.ContextKeyTokenRoutingStrategy) != "" && len(tokenAllowedGroups) == 0 {
\t\tif tokenGroup != "" && tokenGroup != "auto" {
\t\t\ttokenAllowedGroups = []string{tokenGroup}
\t\t} else {
\t\t\tfor groupName := range service.GetUserUsableGroups(userGroup) {
\t\t\t\tgroupName = strings.TrimSpace(groupName)
\t\t\t\tif groupName != "" && groupName != "auto" {
\t\t\t\t\ttokenAllowedGroups = append(tokenAllowedGroups, groupName)
\t\t\t\t}
\t\t\t}
\t\t\tif len(tokenAllowedGroups) == 0 && strings.TrimSpace(userGroup) != "" {
\t\t\t\ttokenAllowedGroups = []string{userGroup}
\t\t\t}
\t\t}
\t}
\tif len(tokenAllowedGroups) > 0 {
\t\townerGroups := make([]string, 0, len(tokenAllowedGroups))
\t\tseenGroups := make(map[string]struct{}, len(tokenAllowedGroups))
\t\tfor _, groupName := range tokenAllowedGroups {
\t\t\tgroupName = strings.TrimSpace(groupName)
\t\t\tif groupName == "" || groupName == "auto" {
\t\t\t\tcontinue
\t\t\t}
\t\t\tif _, ok := seenGroups[groupName]; ok {
\t\t\t\tcontinue
\t\t\t}
\t\t\tseenGroups[groupName] = struct{}{}
\t\t\townerGroups = append(ownerGroups, groupName)
\t\t}
\t\tif len(ownerGroups) > 0 {
\t\t\treturn modelListGroups{
\t\t\t\tuserGroup:   userGroup,
\t\t\t\ttokenGroup:  tokenGroup,
\t\t\t\townerGroups: ownerGroups,
\t\t\t}, nil
\t\t}
\t}
"""
        text = text.replace(latest_anchor, "\n" + snippet + latest_anchor.lstrip("\n"), 1)
        write("controller/model.go", text)
        return

    if "\t\tvar models []string\n\t\tif tokenGroup == \"auto\" {\n" in text:
        text = text.replace(
            "\t\tvar models []string\n\t\tif tokenGroup == \"auto\" {\n",
            "\t\tvar models []string\n\t\ttokenAllowedGroups := common.GetContextKeyStringSlice(c, constant.ContextKeyTokenAllowedGroups)\n\t\tif common.GetContextKeyString(c, constant.ContextKeyTokenRoutingStrategy) != \"\" && len(tokenAllowedGroups) == 0 {\n\t\t\tfor groupName := range service.GetUserUsableGroups(userGroup) {\n\t\t\t\tif groupName != \"\" && groupName != \"auto\" {\n\t\t\t\t\ttokenAllowedGroups = append(tokenAllowedGroups, groupName)\n\t\t\t\t}\n\t\t\t}\n\t\t}\n\t\tif len(tokenAllowedGroups) > 0 {\n\t\t\tfor _, allowedGroup := range tokenAllowedGroups {\n\t\t\t\tgroupModels := model.GetGroupEnabledModels(allowedGroup)\n\t\t\t\tfor _, g := range groupModels {\n\t\t\t\t\tif !common.StringsContains(models, g) {\n\t\t\t\t\t\tmodels = append(models, g)\n\t\t\t\t\t}\n\t\t\t\t}\n\t\t\t}\n\t\t} else if tokenGroup == \"auto\" {\n",
            1,
        )
        write("controller/model.go", text)
        return

    insert_after(
        "controller/model.go",
        "\tif len(tokenAllowedGroups) > 0 {\n",
        "\t\tif common.GetContextKeyString(c, constant.ContextKeyTokenRoutingStrategy) != \"\" && len(tokenAllowedGroups) == 0 {\n\t\t\townerGroups := make([]string, 0)\n\t\t\tfor group := range service.GetUserUsableGroups(userGroup) {\n\t\t\t\tif group != \"\" && group != \"auto\" {\n\t\t\t\t\townerGroups = appendModelOwnerGroup(ownerGroups, group)\n\t\t\t\t}\n\t\t\t}\n\t\t\tif len(ownerGroups) == 0 {\n\t\t\t\townerGroups = []string{userGroup}\n\t\t\t}\n\t\t\treturn modelListGroups{userGroup: userGroup, tokenGroup: tokenGroup, ownerGroups: ownerGroups}, nil\n\t\t}\n",
        "ContextKeyTokenRoutingStrategy) != \"\" && len(tokenAllowedGroups) == 0",
        "smart route model list",
    )
    text = read("controller/model.go")
    broken = (
        "\tif len(tokenAllowedGroups) > 0 {\n"
        "\t\tif common.GetContextKeyString(c, constant.ContextKeyTokenRoutingStrategy) != \"\" && len(tokenAllowedGroups) == 0 {"
    )
    if broken in text:
        fixed = (
            "\tif common.GetContextKeyString(c, constant.ContextKeyTokenRoutingStrategy) != \"\" && len(tokenAllowedGroups) == 0 {"
        )
        text = text.replace(broken, fixed, 1)
        text = text.replace("\n\t\t}\n\t\townerGroups := expandModelOwnerGroups(userGroup, tokenAllowedGroups)", "\n\t}\n\n\tif len(tokenAllowedGroups) > 0 {\n\t\townerGroups := expandModelOwnerGroups(userGroup, tokenAllowedGroups)", 1)
        write("controller/model.go", text)


def ensure_perf_metric_model_file() -> None:
    if exists("model/perf_metric.go"):
        return
    write(
        "model/perf_metric.go",
        """package model

import (
\t"time"

\t"gorm.io/gorm"
\t"gorm.io/gorm/clause"
)

// PerfMetric stores aggregated relay performance metrics for smart routing.
type PerfMetric struct {
\tId             int    `json:"id" gorm:"primaryKey"`
\tModelName      string `json:"model_name" gorm:"size:128;uniqueIndex:idx_perf_model_group_bucket,priority:1"`
\tGroup          string `json:"group" gorm:"column:group;size:64;uniqueIndex:idx_perf_model_group_bucket,priority:2"`
\tBucketTs       int64  `json:"bucket_ts" gorm:"uniqueIndex:idx_perf_model_group_bucket,priority:3;index:idx_perf_bucket_ts"`
\tRequestCount   int64  `json:"-" gorm:"default:0"`
\tSuccessCount   int64  `json:"-" gorm:"default:0"`
\tTotalLatencyMs int64  `json:"-" gorm:"default:0"`
\tTtftSumMs      int64  `json:"-" gorm:"default:0"`
\tTtftCount      int64  `json:"-" gorm:"default:0"`
\tOutputTokens   int64  `json:"-" gorm:"default:0"`
\tGenerationMs   int64  `json:"-" gorm:"default:0"`
}

func (PerfMetric) TableName() string {
\treturn "perf_metrics"
}

func UpsertPerfMetric(metric *PerfMetric) error {
\tif metric == nil || metric.RequestCount == 0 {
\t\treturn nil
\t}
\treturn DB.Clauses(clause.OnConflict{
\t\tColumns: []clause.Column{
\t\t\t{Name: "model_name"},
\t\t\t{Name: "group"},
\t\t\t{Name: "bucket_ts"},
\t\t},
\t\tDoUpdates: clause.Assignments(map[string]interface{}{
\t\t\t"request_count":    gorm.Expr("perf_metrics.request_count + ?", metric.RequestCount),
\t\t\t"success_count":    gorm.Expr("perf_metrics.success_count + ?", metric.SuccessCount),
\t\t\t"total_latency_ms": gorm.Expr("perf_metrics.total_latency_ms + ?", metric.TotalLatencyMs),
\t\t\t"ttft_sum_ms":      gorm.Expr("perf_metrics.ttft_sum_ms + ?", metric.TtftSumMs),
\t\t\t"ttft_count":       gorm.Expr("perf_metrics.ttft_count + ?", metric.TtftCount),
\t\t\t"output_tokens":    gorm.Expr("perf_metrics.output_tokens + ?", metric.OutputTokens),
\t\t\t"generation_ms":    gorm.Expr("perf_metrics.generation_ms + ?", metric.GenerationMs),
\t\t}),
\t}).Create(metric).Error
}

func GetPerfMetrics(modelName string, group string, startTs int64, endTs int64) ([]PerfMetric, error) {
\tvar metrics []PerfMetric
\tquery := DB.Model(&PerfMetric{}).
\t\tWhere("model_name = ? AND bucket_ts >= ? AND bucket_ts <= ?", modelName, startTs, endTs)
\tif group != "" {
\t\tquery = query.Where(commonGroupCol+" = ?", group)
\t}
\terr := query.Order("bucket_ts ASC").Find(&metrics).Error
\treturn metrics, err
}

func DeletePerfMetricsBefore(cutoffTs int64) error {
\tif cutoffTs <= 0 {
\t\treturn nil
\t}
\treturn DB.Where("bucket_ts < ?", cutoffTs).Delete(&PerfMetric{}).Error
}

func PerfMetricStartTime(hours int) int64 {
\tif hours <= 0 {
\t\thours = 24
\t}
\treturn time.Now().Add(-time.Duration(hours) * time.Hour).Unix()
}
""",
    )


def patch_channel_perf_model() -> None:
    ensure_perf_metric_model_file()
    insert_after(
        "model/perf_metric.go",
        """func GetPerfMetrics(modelName string, group string, startTs int64, endTs int64) ([]PerfMetric, error) {
\tvar metrics []PerfMetric
\tquery := DB.Model(&PerfMetric{}).
\t\tWhere("model_name = ? AND bucket_ts >= ? AND bucket_ts <= ?", modelName, startTs, endTs)
\tif group != "" {
\t\tquery = query.Where(commonGroupCol+" = ?", group)
\t}
\terr := query.Order("bucket_ts ASC").Find(&metrics).Error
\treturn metrics, err
}
""",
        """

// ChannelPerfMetric stores internal smart-routing metrics at model + group + channel granularity.
type ChannelPerfMetric struct {
\tId             int    `json:"id" gorm:"primaryKey"`
\tModelName      string `json:"model_name" gorm:"size:128;uniqueIndex:idx_channel_perf_model_group_channel_bucket,priority:1"`
\tGroup          string `json:"group" gorm:"column:group;size:64;uniqueIndex:idx_channel_perf_model_group_channel_bucket,priority:2"`
\tChannelId      int    `json:"channel_id" gorm:"uniqueIndex:idx_channel_perf_model_group_channel_bucket,priority:3;index:idx_channel_perf_channel"`
\tBucketTs       int64  `json:"bucket_ts" gorm:"uniqueIndex:idx_channel_perf_model_group_channel_bucket,priority:4;index:idx_channel_perf_bucket_ts"`
\tRequestCount   int64  `json:"-" gorm:"default:0"`
\tSuccessCount   int64  `json:"-" gorm:"default:0"`
\tTotalLatencyMs int64  `json:"-" gorm:"default:0"`
\tTtftSumMs      int64  `json:"-" gorm:"default:0"`
\tTtftCount      int64  `json:"-" gorm:"default:0"`
\tOutputTokens   int64  `json:"-" gorm:"default:0"`
\tGenerationMs   int64  `json:"-" gorm:"default:0"`
}

func (ChannelPerfMetric) TableName() string {
\treturn "channel_perf_metrics"
}

func UpsertChannelPerfMetric(metric *ChannelPerfMetric) error {
\tif metric == nil || metric.RequestCount == 0 || metric.ChannelId <= 0 {
\t\treturn nil
\t}
\treturn DB.Clauses(clause.OnConflict{
\t\tColumns: []clause.Column{
\t\t\t{Name: "model_name"},
\t\t\t{Name: "group"},
\t\t\t{Name: "channel_id"},
\t\t\t{Name: "bucket_ts"},
\t\t},
\t\tDoUpdates: clause.Assignments(map[string]interface{}{
\t\t\t"request_count":    gorm.Expr("channel_perf_metrics.request_count + ?", metric.RequestCount),
\t\t\t"success_count":    gorm.Expr("channel_perf_metrics.success_count + ?", metric.SuccessCount),
\t\t\t"total_latency_ms": gorm.Expr("channel_perf_metrics.total_latency_ms + ?", metric.TotalLatencyMs),
\t\t\t"ttft_sum_ms":      gorm.Expr("channel_perf_metrics.ttft_sum_ms + ?", metric.TtftSumMs),
\t\t\t"ttft_count":       gorm.Expr("channel_perf_metrics.ttft_count + ?", metric.TtftCount),
\t\t\t"output_tokens":    gorm.Expr("channel_perf_metrics.output_tokens + ?", metric.OutputTokens),
\t\t\t"generation_ms":    gorm.Expr("channel_perf_metrics.generation_ms + ?", metric.GenerationMs),
\t\t}),
\t}).Create(metric).Error
}

func GetChannelPerfMetrics(modelName string, group string, channelID int, startTs int64, endTs int64) ([]ChannelPerfMetric, error) {
\tvar metrics []ChannelPerfMetric
\tif modelName == "" || group == "" || channelID <= 0 {
\t\treturn metrics, nil
\t}
\terr := DB.Model(&ChannelPerfMetric{}).
\t\tWhere("model_name = ? AND "+commonGroupCol+" = ? AND channel_id = ? AND bucket_ts >= ? AND bucket_ts <= ?", modelName, group, channelID, startTs, endTs).
\t\tOrder("bucket_ts ASC").
\t\tFind(&metrics).Error
\treturn metrics, err
}

func DeleteChannelPerfMetricsBefore(cutoffTs int64) error {
\tif cutoffTs <= 0 {
\t\treturn nil
\t}
\treturn DB.Where("bucket_ts < ?", cutoffTs).Delete(&ChannelPerfMetric{}).Error
}
""",
        "type ChannelPerfMetric struct",
        "channel perf metric model",
    )
    text = read("model/main.go")
    if "&ChannelPerfMetric{}" not in text:
        if "\t\t&PerfMetric{},\n" in text:
            text = text.replace(
                "\t\t&PerfMetric{},\n",
                "\t\t&PerfMetric{},\n\t\t&ChannelPerfMetric{},\n",
                1,
            )
        elif "\t\t&Ability{},\n" in text:
            text = text.replace(
                "\t\t&Ability{},\n",
                "\t\t&Ability{},\n\t\t&PerfMetric{},\n\t\t&ChannelPerfMetric{},\n",
                1,
            )
        else:
            raise SystemExit("smart routing patch failed: channel perf metric automigrate anchor not found in model/main.go")
        write("model/main.go", text)
    text = read("model/main.go")
    if '"ChannelPerfMetric"' not in text:
        if '\t\t{&PerfMetric{}, "PerfMetric"},\n' in text:
            text = text.replace(
                '\t\t{&PerfMetric{}, "PerfMetric"},\n',
                '\t\t{&PerfMetric{}, "PerfMetric"},\n\t\t{&ChannelPerfMetric{}, "ChannelPerfMetric"},\n',
                1,
            )
        elif '\t\t{&Ability{}, "Ability"},\n' in text:
            text = text.replace(
                '\t\t{&Ability{}, "Ability"},\n',
                '\t\t{&Ability{}, "Ability"},\n\t\t{&PerfMetric{}, "PerfMetric"},\n\t\t{&ChannelPerfMetric{}, "ChannelPerfMetric"},\n',
                1,
            )
        else:
            raise SystemExit("smart routing patch failed: channel perf metric fast migration anchor not found in model/main.go")
        write("model/main.go", text)


def patch_channel_perf_runtime() -> None:
    required = [
        "pkg/perf_metrics/types.go",
        "pkg/perf_metrics/metrics.go",
        "pkg/perf_metrics/flush.go",
    ]
    if not all(exists(rel) for rel in required):
        print("skip smart routing perf runtime patch: pkg/perf_metrics not found in this NewAPI source")
        return
    replace_once(
        "pkg/perf_metrics/types.go",
        "type Sample struct {\n\tModel        string\n\tGroup        string\n",
        "type Sample struct {\n\tModel        string\n\tGroup        string\n\tChannelId    int\n",
        "perf sample channel id",
    )
    insert_after(
        "pkg/perf_metrics/types.go",
        "type bucketKey struct {\n\tmodel    string\n\tgroup    string\n\tbucketTs int64\n}\n",
        """

type channelBucketKey struct {
\tmodel     string
\tgroup     string
\tchannelID int
\tbucketTs  int64
}
""",
        "type channelBucketKey struct",
        "channel bucket key",
    )
    insert_after(
        "pkg/perf_metrics/metrics.go",
        "var hotBuckets sync.Map\n",
        "var channelHotBuckets sync.Map\n",
        "channelHotBuckets",
        "channel hot buckets",
    )
    insert_after(
        "pkg/perf_metrics/metrics.go",
        "\tRecord(Sample{\n\t\tModel:        info.OriginModelName,\n\t\tGroup:        info.UsingGroup,\n",
        "\t\tChannelId:    info.ChannelId,\n",
        "ChannelId:    info.ChannelId",
        "record relay sample channel id",
    )
    insert_after(
        "pkg/perf_metrics/metrics.go",
        "\tRecord(Sample{\n\t\tModel:        info.OriginModelName,\n\t\tGroup:        info.UsingGroup,\n\t\tChannelId:    info.ChannelId,\n\t\tLatencyMs:    latencyMs,\n\t\tTtftMs:       ttftMs,\n\t\tHasTtft:      hasTtft,\n\t\tSuccess:      success,\n\t\tOutputTokens: outputTokens,\n\t\tGenerationMs: generationMs,\n\t})\n",
        "\tRecordChannel(Sample{\n\t\tModel:        info.OriginModelName,\n\t\tGroup:        info.UsingGroup,\n\t\tChannelId:    info.ChannelId,\n\t\tLatencyMs:    latencyMs,\n\t\tTtftMs:       ttftMs,\n\t\tHasTtft:      hasTtft,\n\t\tSuccess:      success,\n\t\tOutputTokens: outputTokens,\n\t\tGenerationMs: generationMs,\n\t})\n",
        "RecordChannel(Sample",
        "record channel sample",
    )
    insert_after(
        "pkg/perf_metrics/metrics.go",
        "func Record(sample Sample) {\n\tsetting := perf_metrics_setting.GetSetting()\n\tif !setting.Enabled || sample.Model == \"\" {\n\t\treturn\n\t}\n\tif sample.Group == \"\" {\n\t\tsample.Group = \"default\"\n\t}\n\tif sample.LatencyMs < 0 {\n\t\tsample.LatencyMs = 0\n\t}\n\n\tkey := bucketKey{\n\t\tmodel:    sample.Model,\n\t\tgroup:    sample.Group,\n\t\tbucketTs: bucketStart(time.Now().Unix()),\n\t}\n\tactual, _ := hotBuckets.LoadOrStore(key, &atomicBucket{})\n\tactual.(*atomicBucket).add(sample)\n\trecordRedis(key, sample)\n}\n",
        """

func RecordChannel(sample Sample) {
\tsetting := perf_metrics_setting.GetSetting()
\tif !setting.Enabled || sample.Model == "" || sample.ChannelId <= 0 {
\t\treturn
\t}
\tif sample.Group == "" {
\t\tsample.Group = "default"
\t}
\tif sample.LatencyMs < 0 {
\t\tsample.LatencyMs = 0
\t}
\tkey := channelBucketKey{
\t\tmodel:     sample.Model,
\t\tgroup:     sample.Group,
\t\tchannelID: sample.ChannelId,
\t\tbucketTs:  bucketStart(time.Now().Unix()),
\t}
\tactual, _ := channelHotBuckets.LoadOrStore(key, &atomicBucket{})
\tactual.(*atomicBucket).add(sample)
}
""",
        "func RecordChannel(sample Sample)",
        "record channel metric",
    )
    insert_after(
        "pkg/perf_metrics/flush.go",
        "func flushCompletedBuckets() {\n\tcurrentBucket := bucketStart(time.Now().Unix())\n",
        "\tflushCompletedChannelBuckets(currentBucket)\n",
        "flushCompletedChannelBuckets(currentBucket)",
        "flush channel buckets call",
    )
    insert_after(
        "pkg/perf_metrics/flush.go",
        "func deleteOldEmptyBucket(k bucketKey, rawKey any) {\n\tif k.bucketTs < bucketStart(time.Now().Add(-24*time.Hour).Unix()) {\n\t\thotBuckets.Delete(rawKey)\n\t}\n}\n",
        """

func flushCompletedChannelBuckets(currentBucket int64) {
\tchannelHotBuckets.Range(func(key, value any) bool {
\t\tk := key.(channelBucketKey)
\t\tif k.bucketTs >= currentBucket {
\t\t\treturn true
\t\t}
\t\tbucket := value.(*atomicBucket)
\t\tdrained := bucket.drain()
\t\tif drained.requestCount == 0 {
\t\t\tdeleteOldEmptyChannelBucket(k, key)
\t\t\treturn true
\t\t}
\t\terr := model.UpsertChannelPerfMetric(&model.ChannelPerfMetric{
\t\t\tModelName:      k.model,
\t\t\tGroup:          k.group,
\t\t\tChannelId:      k.channelID,
\t\t\tBucketTs:       k.bucketTs,
\t\t\tRequestCount:   drained.requestCount,
\t\t\tSuccessCount:   drained.successCount,
\t\t\tTotalLatencyMs: drained.totalLatencyMs,
\t\t\tTtftSumMs:      drained.ttftSumMs,
\t\t\tTtftCount:      drained.ttftCount,
\t\t\tOutputTokens:   drained.outputTokens,
\t\t\tGenerationMs:   drained.generationMs,
\t\t})
\t\tif err != nil {
\t\t\tbucket.addCounters(drained)
\t\t\tcommon.SysError(fmt.Sprintf("failed to flush channel perf metric bucket model=%s group=%s channel=%d bucket=%d: %s", k.model, k.group, k.channelID, k.bucketTs, err.Error()))
\t\t\treturn true
\t\t}
\t\tdeleteOldEmptyChannelBucket(k, key)
\t\treturn true
\t})
}

func deleteOldEmptyChannelBucket(k channelBucketKey, rawKey any) {
\tif k.bucketTs < bucketStart(time.Now().Add(-24*time.Hour).Unix()) {
\t\tchannelHotBuckets.Delete(rawKey)
\t}
}
""",
        "func flushCompletedChannelBuckets(currentBucket int64)",
        "flush channel buckets",
    )
    insert_after(
        "pkg/perf_metrics/flush.go",
        "\tif err := model.DeletePerfMetricsBefore(cutoff); err != nil {\n\t\tcommon.SysError(\"failed to cleanup expired perf metrics: \" + err.Error())\n\t}\n",
        "\tif err := model.DeleteChannelPerfMetricsBefore(cutoff); err != nil {\n\t\tcommon.SysError(\"failed to cleanup expired channel perf metrics: \" + err.Error())\n\t}\n",
        "DeleteChannelPerfMetricsBefore",
        "cleanup channel perf metrics",
    )


def patch_channel_smart_model_selection() -> None:
    patch_import(
        "model/ability.go",
        '"github.com/QuantumNous/new-api/logger"',
        '"github.com/QuantumNous/new-api/constant"',
        "ability logger",
    )
    channel_smart_helpers = """
var channelSmartScoreCache sync.Map

const (
\tchannelSmartRoutingDefaultSamples     int64   = 200
\tchannelSmartRoutingDefaultSuccessRate float64 = 0.95
\tchannelSmartRoutingDefaultTTFTMs      float64 = 3000
\tchannelSmartRoutingLookbackHours              = 24
\tchannelSmartRoutingScoreTTL                   = 30 * time.Second
)

type channelSmartScoreCacheEntry struct {
\tscore     float64
\texpiresAt time.Time
}

func channelSmartRoutingScore(modelName string, group string, channelID int) float64 {
\tif modelName == "" || group == "" || channelID <= 0 {
\t\treturn 1
\t}
\tcacheKey := fmt.Sprintf("%s|%s|%d", modelName, group, channelID)
\tnow := time.Now()
\tif value, ok := channelSmartScoreCache.Load(cacheKey); ok {
\t\tentry, ok := value.(channelSmartScoreCacheEntry)
\t\tif ok && now.Before(entry.expiresAt) {
\t\t\treturn entry.score
\t\t}
\t}
\tmetrics, err := GetChannelPerfMetrics(modelName, group, channelID, PerfMetricStartTime(channelSmartRoutingLookbackHours), now.Unix())
\tif err != nil {
\t\treturn 1
\t}
\tvar requests int64
\tvar successes int64
\tvar ttftCount int64
\tvar ttftSum int64
\tfor _, metric := range metrics {
\t\trequests += metric.RequestCount
\t\tsuccesses += metric.SuccessCount
\t\tttftCount += metric.TtftCount
\t\tttftSum += metric.TtftSumMs
\t}
\tvirtualRequests := channelSmartRoutingDefaultSamples - requests
\tif virtualRequests < 0 {
\t\tvirtualRequests = 0
\t}
\tsuccessDenominator := requests + virtualRequests
\tsuccessRate := channelSmartRoutingDefaultSuccessRate
\tif successDenominator > 0 {
\t\tsuccessRate = (float64(successes) + channelSmartRoutingDefaultSuccessRate*float64(virtualRequests)) / float64(successDenominator)
\t}
\tvirtualTTFT := channelSmartRoutingDefaultSamples - ttftCount
\tif virtualTTFT < 0 {
\t\tvirtualTTFT = 0
\t}
\tttftDenominator := ttftCount + virtualTTFT
\tttftMs := channelSmartRoutingDefaultTTFTMs
\tif ttftDenominator > 0 {
\t\tttftMs = (float64(ttftSum) + channelSmartRoutingDefaultTTFTMs*float64(virtualTTFT)) / float64(ttftDenominator)
\t}
\tspeedScore := channelSmartRoutingDefaultTTFTMs / ttftMs
\tif speedScore < 0.2 {
\t\tspeedScore = 0.2
\t}
\tif speedScore > 1.5 {
\t\tspeedScore = 1.5
\t}
\tscore := 0.72*successRate + 0.28*speedScore
\tif score < 0.1 {
\t\tscore = 0.1
\t}
\tif score > 1.5 {
\t\tscore = 1.5
\t}
\tchannelSmartScoreCache.Store(cacheKey, channelSmartScoreCacheEntry{
\t\tscore:     score,
\t\texpiresAt: now.Add(channelSmartRoutingScoreTTL),
\t})
\treturn score
}

func channelSmartRoutingEffectiveWeight(baseWeight int, modelName string, group string, channelID int) int {
\tif baseWeight <= 0 {
\t\treturn 0
\t}
\teffective := int(float64(baseWeight) * channelSmartRoutingScore(modelName, group, channelID))
\tif effective < 1 {
\t\treturn 1
\t}
\treturn effective
}
"""
    text = read("model/channel_cache.go")
    if "channelSmartScoreCache" not in text:
        if "var channel2advancedCustomConfig map[int]*dto.AdvancedCustomConfig\nvar channelSyncLock sync.RWMutex\n" in text:
            text = text.replace(
                "var channel2advancedCustomConfig map[int]*dto.AdvancedCustomConfig\nvar channelSyncLock sync.RWMutex\n",
                "var channel2advancedCustomConfig map[int]*dto.AdvancedCustomConfig\nvar channelSyncLock sync.RWMutex\n" + channel_smart_helpers,
                1,
            )
        elif "var channelSyncLock sync.RWMutex\n" in text:
            text = text.replace(
                "var channelSyncLock sync.RWMutex\n",
                "var channelSyncLock sync.RWMutex\n" + channel_smart_helpers,
                1,
            )
        else:
            raise SystemExit("smart routing patch failed: channel smart score helpers anchor not found in model/channel_cache.go")
        write("model/channel_cache.go", text)
    replace_once(
        "model/channel_cache.go",
        """\t// get the priority for the given retry number
\tvar sumWeight = 0
\tvar targetChannels []*Channel
\tfor _, channelId := range channels {
\t\tif channel, ok := channelsIDM[channelId]; ok {
\t\t\tif channel.GetPriority() == targetPriority {
\t\t\t\tsumWeight += channel.GetWeight()
\t\t\t\ttargetChannels = append(targetChannels, channel)
\t\t\t}
\t\t} else {
\t\t\treturn nil, fmt.Errorf("数据库一致性错误，渠道# %d 不存在，请联系管理员修复", channelId)
\t\t}
\t}
""",
        """\t// get the priority for the given retry number
\tvar rawSumWeight = 0
\tvar sumWeight = 0
\tvar targetChannels []*Channel
\teffectiveWeights := make(map[int]int)
\tfor _, channelId := range channels {
\t\tif channel, ok := channelsIDM[channelId]; ok {
\t\t\tif channel.GetPriority() == targetPriority {
\t\t\t\trawSumWeight += channel.GetWeight()
\t\t\t\ttargetChannels = append(targetChannels, channel)
\t\t\t}
\t\t} else {
\t\t\treturn nil, fmt.Errorf("数据库一致性错误，渠道# %d 不存在，请联系管理员修复", channelId)
\t\t}
\t}
\tfor _, channel := range targetChannels {
\t\tbaseWeight := channel.GetWeight()
\t\tif rawSumWeight == 0 {
\t\t\tbaseWeight = 100
\t\t}
\t\tsmartScore := channelSmartRoutingScore(model, group, channel.Id)
\t\teffectiveWeight := int(float64(baseWeight) * smartScore)
\t\tif effectiveWeight < 1 {
\t\t\teffectiveWeight = 1
\t\t}
\t\teffectiveWeights[channel.Id] = effectiveWeight
\t\tsumWeight += effectiveWeight
\t\tlogger.LogDebug(nil, "Channel smart routing candidate: group=%s model=%s channel_id=%d channel_name=%s priority=%d base_weight=%d smart_score=%f effective_weight=%d", group, model, channel.Id, channel.Name, targetPriority, baseWeight, smartScore, effectiveWeight)
\t}
""",
        "channel cache smart effective weights",
    )
    replace_once(
        "model/channel_cache.go",
        """\t// smoothing factor and adjustment
\tsmoothingFactor := 1
\tsmoothingAdjustment := 0

\tif sumWeight == 0 {
\t\t// when all channels have weight 0, set sumWeight to the number of channels and set smoothing adjustment to 100
\t\t// each channel's effective weight = 100
\t\tsumWeight = len(targetChannels) * 100
\t\tsmoothingAdjustment = 100
\t} else if sumWeight/len(targetChannels) < 10 {
\t\t// when the average weight is less than 10, set smoothing factor to 100
\t\tsmoothingFactor = 100
\t}
""",
        """\t// smoothing factor keeps small effective weights from becoming too coarse.
\tsmoothingFactor := 1
\tif sumWeight == 0 {
\t\treturn nil, errors.New("channel smart routing effective weight is zero")
\t} else if sumWeight/len(targetChannels) < 10 {
\t\tsmoothingFactor = 100
\t}
""",
        "channel cache smart smoothing",
    )
    replace_once(
        "model/channel_cache.go",
        """\t// Find a channel based on its weight
\tfor _, channel := range targetChannels {
\t\trandomWeight -= channel.GetWeight()*smoothingFactor + smoothingAdjustment
\t\tif randomWeight < 0 {
\t\t\treturn channel, nil
\t\t}
\t}
""",
        """\t// Find a channel based on its official weight adjusted by internal smart score.
\tfor _, channel := range targetChannels {
\t\trandomWeight -= effectiveWeights[channel.Id] * smoothingFactor
\t\tif randomWeight < 0 {
\t\t\tlogger.LogDebug(nil, "Channel smart routing selected: group=%s model=%s channel_id=%d channel_name=%s priority=%d effective_weight=%d", group, model, channel.Id, channel.Name, targetPriority, effectiveWeights[channel.Id])
\t\t\treturn channel, nil
\t\t}
\t}
""",
        "channel cache smart weighted pick",
    )
    replace_once(
        "model/ability.go",
        """\tif len(abilities) > 0 {
\t\t// Randomly choose one
\t\tweightSum := uint(0)
\t\tfor _, ability_ := range abilities {
\t\t\tweightSum += ability_.Weight + 10
\t\t}
\t\t// Randomly choose one
\t\tweight := common.GetRandomInt(int(weightSum))
\t\tfor _, ability_ := range abilities {
\t\t\tweight -= int(ability_.Weight) + 10
\t\t\t//log.Printf("weight: %d, ability weight: %d", weight, *ability_.Weight)
\t\t\tif weight <= 0 {
\t\t\t\tchannel.Id = ability_.ChannelId
\t\t\t\tbreak
\t\t\t}
\t\t}
\t} else {
""",
        """\tif len(abilities) > 0 {
\t\t// Randomly choose one by official ability weight adjusted by internal smart score.
\t\tweightSum := 0
\t\teffectiveWeights := make(map[int]int, len(abilities))
\t\tfor _, ability_ := range abilities {
\t\t\tbaseWeight := int(ability_.Weight) + 10
\t\t\tsmartScore := channelSmartRoutingScore(model, group, ability_.ChannelId)
\t\t\teffectiveWeight := int(float64(baseWeight) * smartScore)
\t\t\tif effectiveWeight < 1 {
\t\t\t\teffectiveWeight = 1
\t\t\t}
\t\t\teffectiveWeights[ability_.ChannelId] = effectiveWeight
\t\t\tweightSum += effectiveWeight
\t\t\tlogger.LogDebug(nil, "Channel smart routing candidate: group=%s model=%s channel_id=%d base_weight=%d smart_score=%f effective_weight=%d", group, model, ability_.ChannelId, baseWeight, smartScore, effectiveWeight)
\t\t}
\t\tif weightSum <= 0 {
\t\t\treturn nil, errors.New("channel smart routing effective weight is zero")
\t\t}
\t\tweight := common.GetRandomInt(weightSum)
\t\tfor _, ability_ := range abilities {
\t\t\tweight -= effectiveWeights[ability_.ChannelId]
\t\t\tif weight <= 0 {
\t\t\t\tchannel.Id = ability_.ChannelId
\t\t\t\tlogger.LogDebug(nil, "Channel smart routing selected: group=%s model=%s channel_id=%d effective_weight=%d", group, model, ability_.ChannelId, effectiveWeights[ability_.ChannelId])
\t\t\t\tbreak
\t\t\t}
\t\t}
\t} else {
""",
        "ability smart weighted pick",
    )


def patch_channel_select() -> None:
    supports_request_path = "RequestPath" in read("service/channel_select.go")
    patch_import("service/channel_select.go", '"math"', '"errors"', "channel_select math")
    patch_import("service/channel_select.go", '"sort"', '"math"', "channel_select sort")
    patch_import("service/channel_select.go", '"strings"', '"sort"', "channel_select strings")
    patch_import("service/channel_select.go", '"time"', '"strings"', "channel_select time")
    patch_import(
        "service/channel_select.go",
        '"github.com/QuantumNous/new-api/setting/ratio_setting"',
        '"github.com/QuantumNous/new-api/setting"',
        "channel_select ratio_setting",
    )

    helpers = r'''

const (
	smartRoutingDefaultSamples     int64   = 200
	smartRoutingDefaultSuccessRate float64 = 0.95
	smartRoutingDefaultTTFTMs      float64 = 3000
	smartRoutingLookbackHours              = 24
)

type smartRoutingCandidate struct {
	group       string
	price      float64
	ttftMs     float64
	success    float64
	score      float64
	sourceRank int
}

func smartRoutingStrategy(ctx *gin.Context) string {
	return model.NormalizeTokenRoutingStrategy(common.GetContextKeyString(ctx, constant.ContextKeyTokenRoutingStrategy))
}

func smartRoutingFilterGroups(modelName string, groups []string) []string {
	filtered := make([]string, 0, len(groups))
	seen := make(map[string]bool, len(groups))
	for _, group := range groups {
		group = strings.TrimSpace(group)
		if group == "" || group == "auto" || seen[group] || !ratio_setting.ContainsGroupRatio(group) {
			continue
		}
		if !common.StringsContains(model.GetGroupEnabledModels(group), modelName) {
			continue
		}
		seen[group] = true
		filtered = append(filtered, group)
	}
	return filtered
}

func smartRoutingAllUsableGroups(userGroup string) []string {
	usable := GetUserUsableGroups(userGroup)
	groups := make([]string, 0, len(usable))
	for group := range usable {
		if group == "" || group == "auto" || !ratio_setting.ContainsGroupRatio(group) {
			continue
		}
		groups = append(groups, group)
	}
	sort.Strings(groups)
	return groups
}

func smartRoutingCandidateGroups(ctx *gin.Context, modelName string) []string {
	groups := common.GetContextKeyStringSlice(ctx, constant.ContextKeyTokenAllowedGroups)
	if len(groups) == 0 {
		userGroup := common.GetContextKeyString(ctx, constant.ContextKeyUserGroup)
		groups = smartRoutingAllUsableGroups(userGroup)
	}
	return smartRoutingFilterGroups(modelName, groups)
}

func smartRoutingMetricScore(modelName string, group string) (float64, float64) {
	endTs := time.Now().Unix()
	metrics, err := model.GetPerfMetrics(modelName, group, model.PerfMetricStartTime(smartRoutingLookbackHours), endTs)
	if err != nil {
		return smartRoutingDefaultSuccessRate, smartRoutingDefaultTTFTMs
	}
	var requests int64
	var successes int64
	var ttftCount int64
	var ttftSum int64
	for _, metric := range metrics {
		requests += metric.RequestCount
		successes += metric.SuccessCount
		ttftCount += metric.TtftCount
		ttftSum += metric.TtftSumMs
	}
	virtualRequests := smartRoutingDefaultSamples - requests
	if virtualRequests < 0 {
		virtualRequests = 0
	}
	successDenominator := requests + virtualRequests
	successRate := smartRoutingDefaultSuccessRate
	if successDenominator > 0 {
		successRate = (float64(successes) + smartRoutingDefaultSuccessRate*float64(virtualRequests)) / float64(successDenominator)
	}

	virtualTTFT := smartRoutingDefaultSamples - ttftCount
	if virtualTTFT < 0 {
		virtualTTFT = 0
	}
	ttftDenominator := ttftCount + virtualTTFT
	ttftMs := smartRoutingDefaultTTFTMs
	if ttftDenominator > 0 {
		ttftMs = (float64(ttftSum) + smartRoutingDefaultTTFTMs*float64(virtualTTFT)) / float64(ttftDenominator)
	}
	return successRate, ttftMs
}

func smartRoutingPriceScore(modelName string, userGroup string, group string) float64 {
	base, _, exists := ratio_setting.GetModelRatioOrPrice(modelName)
	if !exists || base <= 0 || math.IsNaN(base) || math.IsInf(base, 0) {
		base = 1
	}
	groupRatio := GetUserGroupRatio(userGroup, group)
	if groupRatio <= 0 || math.IsNaN(groupRatio) || math.IsInf(groupRatio, 0) {
		groupRatio = 1
	}
	return base * groupRatio
}

func smartRoutingNormalizeLower(value float64, minValue float64, maxValue float64) float64 {
	if maxValue <= minValue {
		return 1
	}
	return 1 - (value-minValue)/(maxValue-minValue)
}

func smartRoutingNormalizeHigher(value float64, minValue float64, maxValue float64) float64 {
	if maxValue <= minValue {
		return 1
	}
	return (value - minValue) / (maxValue - minValue)
}

func smartRoutingGroupsForLog(groups []string) string {
	if len(groups) == 0 {
		return "-"
	}
	return strings.Join(groups, ",")
}

func smartRoutingRank(ctx *gin.Context, strategy string, modelName string, groups []string) []smartRoutingCandidate {
	userGroup := common.GetContextKeyString(ctx, constant.ContextKeyUserGroup)
	candidates := make([]smartRoutingCandidate, 0, len(groups))
	minPrice, maxPrice := math.Inf(1), math.Inf(-1)
	minTTFT, maxTTFT := math.Inf(1), math.Inf(-1)
	minSuccess, maxSuccess := math.Inf(1), math.Inf(-1)

	for i, group := range groups {
		successRate, ttftMs := smartRoutingMetricScore(modelName, group)
		price := smartRoutingPriceScore(modelName, userGroup, group)
		candidate := smartRoutingCandidate{
			group:       group,
			price:      price,
			ttftMs:     ttftMs,
			success:    successRate,
			sourceRank: i,
		}
		candidates = append(candidates, candidate)
		minPrice, maxPrice = math.Min(minPrice, price), math.Max(maxPrice, price)
		minTTFT, maxTTFT = math.Min(minTTFT, ttftMs), math.Max(maxTTFT, ttftMs)
		minSuccess, maxSuccess = math.Min(minSuccess, successRate), math.Max(maxSuccess, successRate)
	}

	for i := range candidates {
		priceScore := smartRoutingNormalizeLower(candidates[i].price, minPrice, maxPrice)
		speedScore := smartRoutingNormalizeLower(candidates[i].ttftMs, minTTFT, maxTTFT)
		successScore := smartRoutingNormalizeHigher(candidates[i].success, minSuccess, maxSuccess)
		candidates[i].score = 0.34*successScore + 0.33*speedScore + 0.33*priceScore
	}

	sort.SliceStable(candidates, func(i, j int) bool {
		a, b := candidates[i], candidates[j]
		switch strategy {
		case model.TokenRoutingPrice:
			if a.price != b.price {
				return a.price < b.price
			}
			if a.success != b.success {
				return a.success > b.success
			}
			return a.ttftMs < b.ttftMs
		case model.TokenRoutingSpeed:
			if a.ttftMs != b.ttftMs {
				return a.ttftMs < b.ttftMs
			}
			if a.success != b.success {
				return a.success > b.success
			}
			return a.price < b.price
		case model.TokenRoutingSuccessRate:
			if a.success != b.success {
				return a.success > b.success
			}
			if a.ttftMs != b.ttftMs {
				return a.ttftMs < b.ttftMs
			}
			return a.price < b.price
		default:
			if a.score != b.score {
				return a.score > b.score
			}
			return a.sourceRank < b.sourceRank
		}
	})
	for _, candidate := range candidates {
		logger.LogDebug(ctx, "Smart routing candidate group: %s strategy=%s model=%s score=%f price=%f ttft=%f success=%f", candidate.group, strategy, modelName, candidate.score, candidate.price, candidate.ttftMs, candidate.success)
	}
	return candidates
}

func smartRoutingTriedGroups(ctx *gin.Context) map[string]bool {
	triedGroups := common.GetContextKeyStringSlice(ctx, constant.ContextKeySmartRouteTriedGroups)
	tried := make(map[string]bool, len(triedGroups))
	for _, group := range triedGroups {
		tried[group] = true
	}
	return tried
}

func smartRoutingMarkTried(ctx *gin.Context, group string) {
	if group == "" {
		return
	}
	groups := common.GetContextKeyStringSlice(ctx, constant.ContextKeySmartRouteTriedGroups)
	if common.StringsContains(groups, group) {
		return
	}
	groups = append(groups, group)
	common.SetContextKey(ctx, constant.ContextKeySmartRouteTriedGroups, groups)
}

func applySelectedRouteGroup(ctx *gin.Context, group string) {
	if group == "" {
		return
	}
	common.SetContextKey(ctx, constant.ContextKeyUsingGroup, group)
	common.SetContextKey(ctx, constant.ContextKeyTokenGroup, group)
}

func getSmartRoutedChannel(param *RetryParam, strategy string) (*model.Channel, string, error) {
	groups := smartRoutingCandidateGroups(param.Ctx, param.ModelName)
	if len(groups) == 0 {
		logger.LogDebug(param.Ctx, "Smart routing no usable candidate groups: strategy=%s model=%s tokenGroup=%s", strategy, param.ModelName, param.TokenGroup)
		return nil, param.TokenGroup, nil
	}
	candidates := smartRoutingRank(param.Ctx, strategy, param.ModelName, groups)
	crossGroupRetry := common.GetContextKeyBool(param.Ctx, constant.ContextKeyTokenCrossGroupRetry)
	tried := smartRoutingTriedGroups(param.Ctx)
	if !crossGroupRetry {
		tried = map[string]bool{}
	}
	for pass := 0; pass < 2; pass++ {
		for _, candidate := range candidates {
			if crossGroupRetry && pass == 0 && tried[candidate.group] {
				continue
			}
			channel, err := model.GetRandomSatisfiedChannel(candidate.group, param.ModelName, 0, param.RequestPath)
			if err != nil {
				return nil, candidate.group, err
			}
			if channel == nil {
				logger.LogDebug(param.Ctx, "Smart routing candidate group has no available channel: %s strategy=%s model=%s pass=%d", candidate.group, strategy, param.ModelName, pass)
				continue
			}
			applySelectedRouteGroup(param.Ctx, candidate.group)
			if crossGroupRetry {
				smartRoutingMarkTried(param.Ctx, candidate.group)
			}
			logger.LogDebug(param.Ctx, "Smart routing selected group: %s channel_id=%d channel_name=%s strategy=%s model=%s score=%f price=%f ttft=%f success=%f crossGroupRetry=%t", candidate.group, channel.Id, channel.Name, strategy, param.ModelName, candidate.score, candidate.price, candidate.ttftMs, candidate.success, crossGroupRetry)
			return channel, candidate.group, nil
		}
		if !crossGroupRetry {
			break
		}
		tried = map[string]bool{}
	}
	return nil, groups[0], nil
}

func getManualOrderedGroupChannel(param *RetryParam, groups []string) (*model.Channel, string, error) {
	allowedGroups := append([]string(nil), groups...)
	groups = smartRoutingFilterGroups(param.ModelName, groups)
	if len(groups) == 0 {
		logger.LogDebug(param.Ctx, "Manual ordered routing no usable groups: model=%s allowed=%s", param.ModelName, smartRoutingGroupsForLog(allowedGroups))
		return nil, param.TokenGroup, nil
	}
	crossGroupRetry := common.GetContextKeyBool(param.Ctx, constant.ContextKeyTokenCrossGroupRetry)
	if !crossGroupRetry && len(groups) > 1 {
		groups = groups[:1]
	}
	retry := param.GetRetry()
	perGroupBudget := (common.RetryTimes + 1 + len(groups) - 1) / len(groups)
	if perGroupBudget < 1 {
		perGroupBudget = 1
	}
	startGroupIndex := retry / perGroupBudget
	if startGroupIndex >= len(groups) {
		startGroupIndex = len(groups) - 1
	}
	logger.LogDebug(param.Ctx, "Manual ordered routing candidates: model=%s allowed=%s usable=%s retry=%d perGroupBudget=%d startGroupIndex=%d retryTimes=%d crossGroupRetry=%t", param.ModelName, smartRoutingGroupsForLog(allowedGroups), smartRoutingGroupsForLog(groups), retry, perGroupBudget, startGroupIndex, common.RetryTimes, crossGroupRetry)
	for i := startGroupIndex; i < len(groups); i++ {
		priorityRetry := 0
		if i == startGroupIndex {
			priorityRetry = retry - i*perGroupBudget
			if priorityRetry < 0 {
				priorityRetry = 0
			}
		}
		channel, err := model.GetRandomSatisfiedChannel(groups[i], param.ModelName, priorityRetry, param.RequestPath)
		if err != nil {
			return nil, groups[i], err
		}
		if channel == nil {
			logger.LogDebug(param.Ctx, "Manual ordered routing group has no available channel: %s model=%s retry=%d priorityRetry=%d", groups[i], param.ModelName, retry, priorityRetry)
			continue
		}
		applySelectedRouteGroup(param.Ctx, groups[i])
		logger.LogDebug(param.Ctx, "Manual ordered routing selected group: %s channel_id=%d channel_name=%s model=%s retry=%d priorityRetry=%d", groups[i], channel.Id, channel.Name, param.ModelName, retry, priorityRetry)
		return channel, groups[i], nil
	}
	return nil, groups[startGroupIndex], nil
}
'''
    if not supports_request_path:
        helpers = helpers.replace(", param.RequestPath", "")
    insert_after(
        "service/channel_select.go",
        "}\n\nfunc (p *RetryParam) ResetRetryNextTry() {\n\tp.resetNextTry = true\n}\n",
        helpers,
        "smartRoutingDefaultSamples",
        "channel_select smart helpers",
    )

    new_func = r'''func CacheGetRandomSatisfiedChannel(param *RetryParam) (*model.Channel, string, error) {
	var channel *model.Channel
	var err error
	selectGroup := param.TokenGroup
	userGroup := common.GetContextKeyString(param.Ctx, constant.ContextKeyUserGroup)
	routingStrategy := smartRoutingStrategy(param.Ctx)
	requestedGroup := common.GetContextKeyString(param.Ctx, constant.ContextKeyRequestedGroup)

	if param.TokenGroup != "auto" && requestedGroup == "" {
		if routingStrategy != "" {
			return getSmartRoutedChannel(param, routingStrategy)
		}
		allowedGroups := common.GetContextKeyStringSlice(param.Ctx, constant.ContextKeyTokenAllowedGroups)
		if len(allowedGroups) > 1 {
			return getManualOrderedGroupChannel(param, allowedGroups)
		}
	}

	if param.TokenGroup == "auto" {
		if len(setting.GetAutoGroups()) == 0 {
			return nil, selectGroup, errors.New("auto groups is not enabled")
		}
		autoGroups := GetUserAutoGroup(userGroup)

		startGroupIndex := 0
		crossGroupRetry := common.GetContextKeyBool(param.Ctx, constant.ContextKeyTokenCrossGroupRetry)

		if lastGroupIndex, exists := common.GetContextKey(param.Ctx, constant.ContextKeyAutoGroupIndex); exists {
			if idx, ok := lastGroupIndex.(int); ok {
				startGroupIndex = idx
			}
		}

		for i := startGroupIndex; i < len(autoGroups); i++ {
			autoGroup := autoGroups[i]
			priorityRetry := param.GetRetry()
			if i > startGroupIndex {
				priorityRetry = 0
			}
			logger.LogDebug(param.Ctx, "Auto selecting group: %s, priorityRetry: %d", autoGroup, priorityRetry)

			channel, _ = model.GetRandomSatisfiedChannel(autoGroup, param.ModelName, priorityRetry, param.RequestPath)
			if channel == nil {
				logger.LogDebug(param.Ctx, "No available channel in group %s for model %s at priorityRetry %d, trying next group", autoGroup, param.ModelName, priorityRetry)
				common.SetContextKey(param.Ctx, constant.ContextKeyAutoGroupIndex, i+1)
				common.SetContextKey(param.Ctx, constant.ContextKeyAutoGroupRetryIndex, 0)
				param.SetRetry(0)
				continue
			}
			common.SetContextKey(param.Ctx, constant.ContextKeyAutoGroup, autoGroup)
			selectGroup = autoGroup
			logger.LogDebug(param.Ctx, "Auto selected group: %s", autoGroup)

			if crossGroupRetry && priorityRetry >= common.RetryTimes {
				logger.LogDebug(param.Ctx, "Current group %s retries exhausted (priorityRetry=%d >= RetryTimes=%d), preparing switch to next group for next retry", autoGroup, priorityRetry, common.RetryTimes)
				common.SetContextKey(param.Ctx, constant.ContextKeyAutoGroupIndex, i+1)
				param.SetRetry(0)
				param.ResetRetryNextTry()
			} else {
				common.SetContextKey(param.Ctx, constant.ContextKeyAutoGroupIndex, i)
			}
			break
		}
	} else {
		channel, err = model.GetRandomSatisfiedChannel(param.TokenGroup, param.ModelName, param.GetRetry(), param.RequestPath)
		if err != nil {
			return nil, param.TokenGroup, err
		}
	}
	return channel, selectGroup, nil
}
'''
    if not supports_request_path:
        new_func = new_func.replace(", param.RequestPath", "")
    regex_replace(
        "service/channel_select.go",
        r"func CacheGetRandomSatisfiedChannel\(param \*RetryParam\) \(\*model\.Channel, string, error\) \{.*\}\s*$",
        new_func + "\n",
        "requestedGroup := common.GetContextKeyString(param.Ctx, constant.ContextKeyRequestedGroup)",
        "channel_select smart function",
    )


def gofmt_files() -> None:
    gofmt = shutil.which("gofmt")
    if not gofmt:
        return
    files = [
        "constant/context_key.go",
        "model/token.go",
        "controller/token.go",
        "middleware/auth.go",
        "middleware/distributor.go",
        "controller/relay.go",
        "controller/model.go",
        "model/perf_metric.go",
        "model/main.go",
        "model/channel_cache.go",
        "model/ability.go",
        "pkg/perf_metrics/types.go",
        "pkg/perf_metrics/metrics.go",
        "pkg/perf_metrics/flush.go",
        "service/channel_select.go",
    ]
    files = [rel for rel in files if exists(rel)]
    if files:
        subprocess.run([gofmt, "-w", *files], cwd=ROOT, check=True)


def main() -> None:
    patch_context_keys()
    patch_token_model()
    patch_token_controller()
    patch_auth()
    patch_distributor()
    patch_relay()
    patch_model_list()
    patch_channel_perf_model()
    patch_channel_perf_runtime()
    patch_channel_smart_model_selection()
    patch_channel_select()
    gofmt_files()
    print("applied berry smart routing backend patch")


if __name__ == "__main__":
    main()
