#!/usr/bin/env python3
from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()


def read(rel: str) -> str:
    path = ROOT / rel
    if not path.exists():
        raise SystemExit(f"subscription group repair patch failed: missing {rel}")
    return path.read_text(encoding="utf-8")


def write(rel: str, text: str) -> None:
    (ROOT / rel).write_text(text, encoding="utf-8")


def insert_before(rel: str, anchor: str, snippet: str, marker: str, label: str) -> None:
    text = read(rel)
    if marker in text:
        return
    if anchor not in text:
        raise SystemExit(f"subscription group repair patch failed: {label} anchor not found in {rel}")
    write(rel, text.replace(anchor, snippet + anchor, 1))


def insert_after(rel: str, anchor: str, snippet: str, marker: str, label: str) -> None:
    text = read(rel)
    if marker in text:
        return
    if anchor not in text:
        raise SystemExit(f"subscription group repair patch failed: {label} anchor not found in {rel}")
    write(rel, text.replace(anchor, anchor + snippet, 1))


def replace_once(rel: str, old: str, new: str, label: str) -> None:
    text = read(rel)
    if new in text:
        return
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"subscription group repair patch failed: {label} matched {count} anchors in {rel}")
    write(rel, text.replace(old, new, 1))


def patch_subscription_model() -> None:
    repair = r'''
// RepairExpiredSubscriptionGroupTransitions repairs legacy expired records that
// predate the official expiry task, without overriding a manually changed group.
func RepairExpiredSubscriptionGroupTransitions(limit int) (int, error) {
	if limit <= 0 {
		limit = 200
	}
	now := GetDBTimestamp()
	type staleSubscriptionGroupCandidate struct {
		Id int `gorm:"column:id"`
	}
	targetGroupExpr := "COALESCE(NULLIF(us.downgrade_group, ''), us.prev_user_group)"
	var candidates []staleSubscriptionGroupCandidate
	if err := DB.Table("user_subscriptions AS us").
		Select("us.id").
		Joins("JOIN users AS u ON u.id = us.user_id").
		Where(
			"us.status = ? AND us.end_time > 0 AND us.end_time <= ? AND us.upgrade_group <> '' AND "+targetGroupExpr+" <> '' AND "+targetGroupExpr+" <> u."+commonGroupCol+" AND u."+commonGroupCol+" = us.upgrade_group AND NOT EXISTS (SELECT 1 FROM user_subscriptions AS active WHERE active.user_id = us.user_id AND active.status = ? AND active.end_time > ? AND active.upgrade_group <> '')",
			"expired",
			now,
			"active",
			now,
		).
		Order("us.end_time desc, us.id desc").
		Limit(limit).
		Scan(&candidates).Error; err != nil {
		return 0, err
	}
	if len(candidates) == 0 {
		return 0, nil
	}

	repairedCount := 0
	seenUsers := make(map[int]struct{}, len(candidates))
	for _, candidate := range candidates {
		cacheGroup := ""
		userId := 0
		err := DB.Transaction(func(tx *gorm.DB) error {
			var sub UserSubscription
			if err := lockForUpdate(tx).Where("id = ?", candidate.Id).First(&sub).Error; err != nil {
				return err
			}
			if _, ok := seenUsers[sub.UserId]; ok {
				return nil
			}
			seenUsers[sub.UserId] = struct{}{}
			userId = sub.UserId

			currentGroup, err := getUserGroupByIdTx(tx, sub.UserId)
			if err != nil {
				return err
			}
			upgradeGroup := strings.TrimSpace(sub.UpgradeGroup)
			if upgradeGroup == "" || currentGroup != upgradeGroup {
				return nil
			}

			var activeSub UserSubscription
			activeQuery := tx.Where("user_id = ? AND status = ? AND end_time > ? AND upgrade_group <> ''",
				sub.UserId, "active", now).
				Order("end_time desc, id desc").
				Limit(1).
				Find(&activeSub)
			if activeQuery.Error == nil && activeQuery.RowsAffected > 0 {
				return nil
			}

			target := strings.TrimSpace(sub.DowngradeGroup)
			if target == "" {
				target = strings.TrimSpace(sub.PrevUserGroup)
			}
			if target == "" || target == currentGroup {
				return nil
			}
			if err := tx.Model(&User{}).Where("id = ?", sub.UserId).
				Update("group", target).Error; err != nil {
				return err
			}
			cacheGroup = target
			repairedCount++
			return nil
		})
		if err != nil {
			return repairedCount, err
		}
		if cacheGroup != "" && userId > 0 {
			refreshSubscriptionUserGroupCache(userId, "expired subscription group repair")
		}
	}
	return repairedCount, nil
}

'''
    insert_before(
        "model/subscription.go",
        "// SubscriptionPreConsumeRecord stores idempotent pre-consume operations per request.\n",
        repair,
        "func RepairExpiredSubscriptionGroupTransitions(",
        "subscription repair model function",
    )


def patch_subscription_task() -> None:
    insert_after(
        "service/subscription_reset_task.go",
        "\tsubscriptionCleanupInterval   = 30 * time.Minute\n",
        "\tsubscriptionGroupRepairInterval = 30 * time.Minute\n",
        "subscriptionGroupRepairInterval",
        "subscription repair interval",
    )
    insert_after(
        "service/subscription_reset_task.go",
        "\tsubscriptionCleanupLast  atomic.Int64\n",
        "\tsubscriptionGroupRepairLast atomic.Int64\n",
        "subscriptionGroupRepairLast",
        "subscription repair state",
    )
    insert_after(
        "service/subscription_reset_task.go",
        "\ttotalExpired := 0\n",
        "\ttotalGroupRepaired := 0\n",
        "totalGroupRepaired := 0",
        "subscription repair counter",
    )

    replace_once(
        "service/subscription_reset_task.go",
        """\t}
\tfor {
\t\tn, err := model.ResetDueSubscriptions(subscriptionResetBatchSize)
""",
        """\t}
\tlastGroupRepair := time.Unix(subscriptionGroupRepairLast.Load(), 0)
\tif time.Since(lastGroupRepair) >= subscriptionGroupRepairInterval {
\t\tfor {
\t\t\tn, err := model.RepairExpiredSubscriptionGroupTransitions(subscriptionResetBatchSize)
\t\t\tif err != nil {
\t\t\t\tlogger.LogWarn(ctx, fmt.Sprintf("expired subscription group repair failed: %v", err))
\t\t\t\tbreak
\t\t\t}
\t\t\tif n == 0 {
\t\t\t\tsubscriptionGroupRepairLast.Store(time.Now().Unix())
\t\t\t\tbreak
\t\t\t}
\t\t\ttotalGroupRepaired += n
\t\t\tif n < subscriptionResetBatchSize {
\t\t\t\tsubscriptionGroupRepairLast.Store(time.Now().Unix())
\t\t\t\tbreak
\t\t\t}
\t\t}
\t}
\tfor {
\t\tn, err := model.ResetDueSubscriptions(subscriptionResetBatchSize)
""",
        "subscription repair task loop",
    )
    replace_once(
        "service/subscription_reset_task.go",
        """\tif common.DebugEnabled && (totalReset > 0 || totalExpired > 0) {
\t\tlogger.LogDebug(ctx, "subscription maintenance: reset_count=%d, expired_count=%d", totalReset, totalExpired)
\t}
""",
        """\tif common.DebugEnabled && (totalReset > 0 || totalExpired > 0 || totalGroupRepaired > 0) {
\t\tlogger.LogDebug(ctx, "subscription maintenance: reset_count=%d, expired_count=%d, repaired_group_count=%d", totalReset, totalExpired, totalGroupRepaired)
\t}
""",
        "subscription repair debug log",
    )


def gofmt_files() -> None:
    gofmt = shutil.which("gofmt")
    if gofmt:
        subprocess.run(
            [gofmt, "-w", "model/subscription.go", "service/subscription_reset_task.go"],
            cwd=ROOT,
            check=True,
        )


def main() -> None:
    patch_subscription_model()
    patch_subscription_task()
    gofmt_files()
    print("applied subscription expiry group repair backend patch")


if __name__ == "__main__":
    main()
