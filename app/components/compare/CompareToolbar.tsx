import { IconButton } from "../button";
import Locale from "../../locales";
import StopIcon from "../../icons/pause.svg";
import CopyIcon from "../../icons/copy.svg";
import MaxIcon from "../../icons/max.svg";
import MinIcon from "../../icons/min.svg";
import styles from "./CompareToolbar.module.scss";

interface CompareToolbarProps {
  layout: "grid" | "list";
  onLayoutChange: (layout: "grid" | "list") => void;
  onStopAll: () => void;
  onCollapseAll: () => void;
  onExpandAll: () => void;
  onCopyAll: () => void;
  streamingCount?: number;
  doneCount?: number;
  totalCount?: number;
}

export function CompareToolbar({
  layout,
  onLayoutChange,
  onStopAll,
  onCollapseAll,
  onExpandAll,
  onCopyAll,
  streamingCount = 0,
  doneCount = 0,
  totalCount = 0,
}: CompareToolbarProps) {
  const hasStreaming = streamingCount > 0;

  return (
    <div className={styles["compare-toolbar"]}>
      <div className={styles["toolbar-left"]}>
        <div className={styles["status-summary"]}>
          <span className={styles["status-text"]}>
            {hasStreaming
              ? `${streamingCount} ${Locale.Compare.Status.Streaming}`
              : `${doneCount}/${totalCount} ${Locale.Compare.Status.Done}`}
          </span>
        </div>
      </div>

      <div className={styles["toolbar-right"]}>
        <div className={styles["toolbar-group"]}>
          <span className={styles["toolbar-label"]}>{Locale.Compare.Layout.Grid}</span>
          <div className={styles["layout-toggle"]}>
            <button
              className={`${styles["layout-btn"]} ${layout === "grid" ? styles.active : ""}`}
              onClick={() => onLayoutChange("grid")}
              title={Locale.Compare.Layout.Grid}
            >
              <MaxIcon />
            </button>
            <button
              className={`${styles["layout-btn"]} ${layout === "list" ? styles.active : ""}`}
              onClick={() => onLayoutChange("list")}
              title={Locale.Compare.Layout.List}
            >
              <MinIcon />
            </button>
          </div>
        </div>

        {layout === "list" && (
          <div className={styles["toolbar-group"]}>
            <button
              className={styles["toolbar-link"]}
              onClick={onExpandAll}
            >
              {Locale.Compare.Actions.ExpandAll}
            </button>
            <span className={styles["divider"]}>/</span>
            <button
              className={styles["toolbar-link"]}
              onClick={onCollapseAll}
            >
              {Locale.Compare.Actions.CollapseAll}
            </button>
          </div>
        )}

        <div className={styles["toolbar-divider"]} />

        <div className={styles["toolbar-actions"]}>
          <IconButton
            icon={<CopyIcon />}
            text={Locale.Compare.Actions.Copy}
            onClick={onCopyAll}
            bordered
            title={Locale.Compare.Actions.Copy}
          />

          {hasStreaming && (
            <IconButton
              icon={<StopIcon />}
              text={Locale.Compare.Actions.StopAll}
              onClick={onStopAll}
              bordered
              type="danger"
              title={Locale.Compare.Actions.StopAll}
            />
          )}
        </div>
      </div>
    </div>
  );
}
