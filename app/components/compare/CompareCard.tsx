import React, { useState } from "react";
import { copyToClipboard } from "../../utils";
import { IconButton } from "../button";
import { showToast } from "../ui-lib";
import Locale from "../../locales";
import LoadingIcon from "../../icons/three-dots.svg";
import StopIcon from "../../icons/pause.svg";
import ResetIcon from "../../icons/reload.svg";
import CopyIcon from "../../icons/copy.svg";
import ConfirmIcon from "../../icons/confirm.svg";
import { Avatar } from "../emoji";
import { Markdown } from "../markdown";
import styles from "./CompareCard.module.scss";
import clsx from "clsx";
import type { CompareResponse, CompareStatus } from "../../typing";

interface CompareCardProps {
  response: CompareResponse;
  layout?: "grid" | "list";
  onCopy: () => void;
  onAdopt: () => void;
  onStop: () => void;
  onRetry: () => void;
}

export function CompareCard({
  response,
  layout = "grid",
  onCopy,
  onAdopt,
  onStop,
  onRetry,
}: CompareCardProps) {
  const [isExpanded, setIsExpanded] = useState(layout === "grid");
  const { model, providerName, content, status, error } = response;

  const getStatusText = () => {
    switch (status) {
      case "pending":
        return Locale.Compare.Status.Pending;
      case "streaming":
        return Locale.Compare.Status.Streaming;
      case "done":
        return Locale.Compare.Status.Done;
      case "error":
        return Locale.Compare.Status.Error;
      case "stopped":
        return Locale.Compare.Status.Stopped;
      default:
        return "";
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case "streaming":
        return <LoadingIcon />;
      case "done":
        return <ConfirmIcon />;
      case "error":
        return <span className={styles["error-icon"]}>!</span>;
      case "stopped":
        return <span className={styles["stopped-icon"]}>■</span>;
      default:
        return null;
    }
  };

  const handleCopy = () => {
    copyToClipboard(content);
    showToast(Locale.Copy.Success);
    onCopy();
  };

  const handleAdopt = () => {
    onAdopt();
    showToast(Locale.Compare.AdoptedToast(model));
  };

  return (
    <div
      className={clsx(styles["compare-card"], {
        [styles["list-layout"]]: layout === "list",
        [styles["grid-layout"]]: layout === "grid",
        [styles["streaming"]]: status === "streaming",
        [styles["error"]]: status === "error",
        [styles["stopped"]]: status === "stopped",
        [styles["collapsed"]]: !isExpanded && layout === "list",
      })}
    >
      {/* 卡片头部 - 模型名称和状态 */}
      <div
        className={styles["card-header"]}
        onClick={() => layout === "list" && setIsExpanded(!isExpanded)}
      >
        <div className={styles["model-info"]}>
          <Avatar model={model} />
          <div className={styles["model-details"]}>
            <div className={styles["model-name"]}>{model}</div>
            <div className={styles["provider-name"]}>{providerName}</div>
          </div>
        </div>
        <div className={styles["status-info"]}>
          {getStatusIcon()}
          <span className={styles["status-text"]}>{getStatusText()}</span>
          {layout === "list" && (
            <span className={styles["expand-icon"]}>{isExpanded ? "▼" : "▶"}</span>
          )}
        </div>
      </div>

      {/* 卡片内容 - 回复内容 */}
      {(isExpanded || layout === "grid") && (
        <div className={styles["card-content"]}>
          {status === "pending" && !content ? (
            <div className={styles["empty-state"]}>
              <LoadingIcon />
              <span>{Locale.Compare.Status.Pending}</span>
            </div>
          ) : status === "error" ? (
            <div className={styles["error-message"]}>
              {error || Locale.Compare.Status.Error}
            </div>
          ) : (
            <Markdown
              content={content || ""}
              loading={status === "streaming" && content.length === 0}
            />
          )}

          {/* Token 统计 */}
          {status === "done" && response.tokens && (
            <div className={styles["token-count"]}>
              {response.tokens} tokens
              {response.latency && ` · ${Math.round(response.latency / 1000)}s`}
            </div>
          )}
        </div>
      )}

      {/* 卡片底部 - 操作按钮 */}
      {(isExpanded || layout === "grid") && (
        <div className={styles["card-actions"]}>
          {status === "streaming" ? (
            <IconButton
              icon={<StopIcon />}
              text={Locale.Compare.Actions.Stop}
              onClick={onStop}
              bordered
            />
          ) : status === "error" || status === "stopped" ? (
            <IconButton
              icon={<ResetIcon />}
              text={Locale.Compare.Actions.Retry}
              onClick={onRetry}
              bordered
            />
          ) : (
            <>
              <IconButton
                icon={<CopyIcon />}
                text={Locale.Compare.Actions.Copy}
                onClick={handleCopy}
                bordered
              />
              {status === "done" && (
                <IconButton
                  icon={<ConfirmIcon />}
                  text={Locale.Compare.Actions.Adopt}
                  onClick={handleAdopt}
                  type="primary"
                  bordered
                />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
