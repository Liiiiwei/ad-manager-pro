/**
 * 將 Windsor 廣告資料轉換為樹狀結構
 * 支援多天資料合併、指標向上聚合、警報計數、暫停節點聚合
 */

import type { WindsorAdRecord } from "@/lib/windsor/types";
import type { Alert } from "@/lib/analysis/types";
import type { TreeNode, TreeNodeMetrics, NodeLevel, NodeStatus } from "./types";

/** 計算花費加權平均值 */
function weightedAvg(values: { value: number; weight: number }[]): number {
  const totalWeight = values.reduce((sum, v) => sum + v.weight, 0);
  if (totalWeight === 0) return 0;
  return values.reduce((sum, v) => sum + v.value * v.weight, 0) / totalWeight;
}

/** 聚合子節點指標（花費加總，其餘用花費加權平均） */
function aggregateMetrics(children: TreeNode[]): TreeNodeMetrics {
  if (children.length === 0) {
    return { spend: 0, roas: 0, ctr: 0, cpc: 0 };
  }

  const spend = children.reduce((sum, c) => sum + c.metrics.spend, 0);
  const roas = weightedAvg(
    children.map((c) => ({ value: c.metrics.roas, weight: c.metrics.spend })),
  );
  const ctr = weightedAvg(
    children.map((c) => ({ value: c.metrics.ctr, weight: c.metrics.spend })),
  );
  const cpc = weightedAvg(
    children.map((c) => ({ value: c.metrics.cpc, weight: c.metrics.spend })),
  );

  return { spend, roas, ctr, cpc };
}

/** 正規化投放狀態字串 */
function normalizeStatus(raw: string): NodeStatus {
  const s = (raw || "").toUpperCase();
  if (!s) return "UNKNOWN";
  if (s === "ACTIVE" || s === "ENABLED") return "ACTIVE";
  return "PAUSED";
}

/**
 * 將同層子節點中「暫停」的節點聚合為單張「已暫停」卡片
 * - 若沒有暫停節點，直接回傳 active/unknown 節點
 * - 若有暫停節點，在尾端加入一張合成節點包住所有暫停子節點
 */
function groupPausedChildren(
  children: TreeNode[],
  parentId: string,
  childLevel: NodeLevel,
  platform: string,
): TreeNode[] {
  const visible: TreeNode[] = [];
  const paused: TreeNode[] = [];
  for (const c of children) {
    if (c.status === "PAUSED") paused.push(c);
    else visible.push(c);
  }

  if (paused.length === 0) return visible;

  const pausedMetrics = aggregateMetrics(paused);
  const pausedAlertCount = paused.reduce((s, n) => s + n.alertCount, 0);

  const group: TreeNode = {
    id: `${parentId}:::__paused__`,
    label: `已暫停 (${paused.length})`,
    level: childLevel,
    platform,
    metrics: pausedMetrics,
    alertCount: pausedAlertCount,
    childCount: paused.length,
    children: paused,
    status: "PAUSED",
    isPausedGroup: true,
  };

  return [...visible, group];
}

/** 計算節點的警報數量 */
function countAlerts(
  alerts: Alert[],
  level: NodeLevel,
  accountName: string,
  campaignName?: string,
  adsetName?: string,
  adName?: string,
): number {
  return alerts.filter((a) => {
    if (a.accountName && a.accountName !== accountName) return false;

    if (level === "campaign" || level === "adset" || level === "ad") {
      if (a.campaignName && a.campaignName !== campaignName) return false;
    }

    if (level === "adset" || level === "ad") {
      if (a.adsetName && a.adsetName !== adsetName) return false;
    }

    if (level === "ad") {
      if (a.adName && a.adName !== adName) return false;
    }

    if (level === "ad") return !!a.adName;
    if (level === "adset") return !!a.adsetName;
    if (level === "campaign") return !!a.campaignName;
    return !!a.accountName;
  }).length;
}

/** 產生唯一節點 ID */
function nodeId(parts: string[]): string {
  return parts.join(":::");
}

/**
 * 將 Windsor 廣告記錄轉換為樹狀結構
 * - 按帳戶 → 廣告活動 → 廣告組 → 廣告分組
 * - 同名廣告的多天資料會合併（花費加總，指標用花費加權平均）
 * - 指標自下而上聚合
 * - 警報計數包含所有子節點
 * - 每層中「暫停」的子節點會聚合為單張「已暫停 (N)」卡片
 */
export function buildTree(
  records: WindsorAdRecord[],
  alerts: Alert[],
): TreeNode[] {
  const accountMap = new Map<
    string,
    Map<string, Map<string, WindsorAdRecord[]>>
  >();
  const accountPlatform = new Map<string, string>();

  for (const r of records) {
    const accName = r.account_name || "未命名帳戶";
    const campName = r.campaign || "未命名廣告活動";
    const adsetName = r.adset || "未命名廣告組";
    const adName = r.ad_name || "未命名廣告";

    if (!accountPlatform.has(accName)) {
      accountPlatform.set(accName, r.source);
    }

    if (!accountMap.has(accName)) {
      accountMap.set(accName, new Map());
    }
    const campMap = accountMap.get(accName)!;

    if (!campMap.has(campName)) {
      campMap.set(campName, new Map());
    }
    const adsetMap = campMap.get(campName)!;

    if (!adsetMap.has(adsetName)) {
      adsetMap.set(adsetName, []);
    }

    adsetMap.get(adsetName)!.push({ ...r, ad_name: adName });
  }

  const trees: TreeNode[] = [];

  for (const [accName, campMap] of accountMap) {
    const platform = accountPlatform.get(accName) || "unknown";
    const campaignNodes: TreeNode[] = [];

    for (const [campName, adsetMap] of campMap) {
      const adsetNodes: TreeNode[] = [];
      let campStatusRaw = "";

      for (const [adsetName, adRecords] of adsetMap) {
        // 取得 adset/campaign 的 status（從任一筆記錄）
        const adsetStatusRaw = adRecords[0]?.adsetStatus || "";
        if (!campStatusRaw) campStatusRaw = adRecords[0]?.campaignStatus || "";

        const adMap = new Map<string, WindsorAdRecord[]>();
        for (const r of adRecords) {
          const name = r.ad_name || "未命名廣告";
          if (!adMap.has(name)) adMap.set(name, []);
          adMap.get(name)!.push(r);
        }

        const adNodes: TreeNode[] = [];
        for (const [adName, dayRecords] of adMap) {
          const spend = dayRecords.reduce((s, r) => s + r.spend, 0);
          const roas = weightedAvg(
            dayRecords.map((r) => ({ value: r.roas, weight: r.spend })),
          );
          const ctr = weightedAvg(
            dayRecords.map((r) => ({ value: r.ctr, weight: r.spend })),
          );
          const cpc = weightedAvg(
            dayRecords.map((r) => ({ value: r.cpc, weight: r.spend })),
          );

          const adAlertCount = countAlerts(
            alerts,
            "ad",
            accName,
            campName,
            adsetName,
            adName,
          );

          const adStatus = normalizeStatus(dayRecords[0]?.adStatus || "");

          adNodes.push({
            id: nodeId([accName, campName, adsetName, adName]),
            label: adName,
            level: "ad",
            platform,
            metrics: { spend, roas, ctr, cpc },
            alertCount: adAlertCount,
            childCount: 0,
            children: [],
            status: adStatus,
          });
        }

        // 同層聚合暫停廣告
        const groupedAds = groupPausedChildren(
          adNodes,
          nodeId([accName, campName, adsetName]),
          "ad",
          platform,
        );

        const adsetMetrics = aggregateMetrics(adNodes);
        const adsetAlertCount =
          countAlerts(alerts, "adset", accName, campName, adsetName) +
          adNodes.reduce((sum, n) => sum + n.alertCount, 0);

        adsetNodes.push({
          id: nodeId([accName, campName, adsetName]),
          label: adsetName,
          level: "adset",
          platform,
          metrics: adsetMetrics,
          alertCount: adsetAlertCount,
          childCount: adNodes.length,
          children: groupedAds,
          status: normalizeStatus(adsetStatusRaw),
        });
      }

      const groupedAdsets = groupPausedChildren(
        adsetNodes,
        nodeId([accName, campName]),
        "adset",
        platform,
      );

      const campMetrics = aggregateMetrics(adsetNodes);
      const campAlertCount =
        countAlerts(alerts, "campaign", accName, campName) +
        adsetNodes.reduce((sum, n) => sum + n.alertCount, 0);

      campaignNodes.push({
        id: nodeId([accName, campName]),
        label: campName,
        level: "campaign",
        platform,
        metrics: campMetrics,
        alertCount: campAlertCount,
        childCount: adsetNodes.length,
        children: groupedAdsets,
        status: normalizeStatus(campStatusRaw),
      });
    }

    const groupedCampaigns = groupPausedChildren(
      campaignNodes,
      nodeId([accName]),
      "campaign",
      platform,
    );

    const accMetrics = aggregateMetrics(campaignNodes);
    const accAlertCount =
      countAlerts(alerts, "account", accName) +
      campaignNodes.reduce((sum, n) => sum + n.alertCount, 0);

    trees.push({
      id: nodeId([accName]),
      label: accName,
      level: "account",
      platform,
      metrics: accMetrics,
      alertCount: accAlertCount,
      childCount: campaignNodes.length,
      children: groupedCampaigns,
      status: "ACTIVE",
    });
  }

  return trees;
}
