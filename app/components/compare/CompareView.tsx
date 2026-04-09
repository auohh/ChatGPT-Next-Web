import React, { useState, useCallback } from "react";
import { CompareCard } from "./CompareCard";
import { CompareToolbar } from "./CompareToolbar";
import { copyToClipboard } from "../../utils";
import { showToast } from "../ui-lib";
import Locale from "../../locales";
import styles from "./CompareView.module.scss";
import clsx from "clsx";
import type { CompareResponse, CompareMeta } from "../../typing";

interface CompareViewProps {
  compareMeta: CompareMeta;
  compareResponses: CompareResponse[];
  layout: "grid" | "list";
  onUpdate: (modelKey: string, updater: (r: CompareResponse) => void) => void;
  onAdopt: (modelKey: string) => void;
  onStop: (modelKey?: string) => void;
  onRetry: (modelKey: string) => void;
  onLayoutChange: (layout: "grid" | "list") => void;
}

export function CompareView({
  compareMeta,
  compareResponses,
  layout,
  onUpdate,
  onAdopt,
  onStop,
  onRetry,
  onLayoutChange,
}: CompareViewProps) {
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  // 计算状态统计
  const statusCount = compareResponses.reduce(
    (acc, response) => {
      acc[response.status] = (acc[response.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const streamingCount = statusCount.streaming || 0;
  const doneCount = statusCount.done || 0;
  const totalCount = compareResponses.length;

  // 处理模型操作
  const handleCopy = useCallback((modelKey: string) => {
    const response = compareResponses.find(
      (r) => `${r.model}@${r.providerName}` === modelKey
    );
    if (response?.content) {
      copyToClipboard(response.content);
      showToast(Locale.Copy.Success);
    }
  }, [compareResponses]);

  const handleAdopt = useCallback((modelKey: string) => {
    onAdopt(modelKey);
  }, [onAdopt]);

  const handleStop = useCallback((modelKey: string) => {
    onStop(modelKey);
  }, [onStop]);

  const handleRetry = useCallback((modelKey: string) => {
    onRetry(modelKey);
  }, [onRetry]);

  // 处理全部停止
  const handleStopAll = useCallback(() => {
    onStop(undefined);
  }, [onStop]);

  // 处理展开/折叠
  const handleExpandAll = useCallback(() => {
    const allKeys = compareResponses.map((r) => `${r.model}@${r.providerName}`);
    setExpandedCards(new Set(allKeys));
  }, [compareResponses]);

  const handleCollapseAll = useCallback(() => {
    setExpandedCards(new Set());
  }, []);

  const handleToggleCard = useCallback((modelKey: string) => {
    setExpandedCards((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(modelKey)) {
        newSet.delete(modelKey);
      } else {
        newSet.add(modelKey);
      }
      return newSet;
    });
  }, []);

  // 处理全部复制
  const handleCopyAll = useCallback(() => {
    const allContent = compareResponses
      .filter((r) => r.status === "done" && r.content)
      .map((r) => `## ${r.model} (@${r.providerName})\n\n${r.content}`)
      .join("\n\n---\n\n");

    if (allContent) {
      copyToClipboard(allContent);
      showToast(Locale.Copy.Success);
    }
  }, [compareResponses]);

  // 检查卡片是否展开
  const isCardExpanded = useCallback((modelKey: string) => {
    return layout === "grid" || expandedCards.has(modelKey);
  }, [layout, expandedCards]);

  return (
    <div className={styles["compare-view"]}>
      <CompareToolbar
        layout={layout}
        onLayoutChange={onLayoutChange}
        onStopAll={handleStopAll}
        onCollapseAll={handleCollapseAll}
        onExpandAll={handleExpandAll}
        onCopyAll={handleCopyAll}
        streamingCount={streamingCount}
        doneCount={doneCount}
        totalCount={totalCount}
      />

      <div
        className={clsx(styles["compare-cards"], {
          [styles["grid-layout"]]: layout === "grid",
          [styles["list-layout"]]: layout === "list",
        })}
      >
        {compareResponses.map((response) => {
          const modelKey = `${response.model}@${response.providerName}`;
          return (
            <CompareCard
              key={modelKey}
              response={response}
              layout={layout}
              onCopy={() => handleCopy(modelKey)}
              onAdopt={() => handleAdopt(modelKey)}
              onStop={() => handleStop(modelKey)}
              onRetry={() => handleRetry(modelKey)}
            />
          );
        })}
      </div>
    </div>
  );
}
