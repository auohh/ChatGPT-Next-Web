import { useState, useEffect } from "react";
import { IconButton } from "./button";
import { getClientConfig } from "../config/client";
import styles from "./prompt.module.scss";

import CloseIcon from "../icons/close.svg";
import ExternalLinkIcon from "../icons/export.svg";
import MaximizeIcon from "../icons/max.svg";
import MinimizeIcon from "../icons/min.svg";
import EyeIcon from "../icons/eye.svg";
import EyeOffIcon from "../icons/eye-off.svg";

interface PromptModalProps {
  onClose: () => void;
}

type ModalSize = "medium" | "wide" | "fullscreen" | "custom";

interface SizeConfig {
  width: string;
  height: string;
  maxWidth?: string;
  maxHeight?: string;
}

const SIZE_PRESETS: Record<ModalSize, SizeConfig> = {
  medium: {
    width: "90vw",
    height: "85vh",
    maxWidth: "1200px",
    maxHeight: "800px",
  },
  wide: {
    width: "95vw",
    height: "92vh",
    maxWidth: "1600px",
    maxHeight: "950px",
  },
  fullscreen: {
    width: "100vw",
    height: "100vh",
    maxWidth: "100vw",
    maxHeight: "100vh",
  },
  custom: {
    width: "90vw",
    height: "85vh",
    maxWidth: "1200px",
    maxHeight: "800px",
  },
};

export function PromptModal({ onClose }: PromptModalProps) {
  // 从客户端配置获取默认 URL
  const getDefaultUrl = () => {
    try {
      // 从客户端配置获取（包含环境变量）
      const clientConfig = getClientConfig();
      if (clientConfig?.promptUrl) return clientConfig.promptUrl;
    } catch (e) {
      console.warn("[PromptModal] Failed to get client config:", e);
    }

    // 默认值
    return "http://localhost:38081/";
  };

  const [url, setUrl] = useState(getDefaultUrl());
  const [tempUrl, setTempUrl] = useState(getDefaultUrl());
  const [isLoading, setIsLoading] = useState(true);
  const [modalSize, setModalSize] = useState<ModalSize>("medium");
  const [customSize, setCustomSize] = useState<SizeConfig>({
    width: "90vw",
    height: "85vh",
    maxWidth: "1200px",
    maxHeight: "800px",
  });
  const [showSizeControls, setShowSizeControls] = useState(false);
  const [showControls, setShowControls] = useState(true);

  const getCurrentSize = () => {
    return modalSize === "custom" ? customSize : SIZE_PRESETS[modalSize];
  };

  const cycleSize = () => {
    const sizeOrder: ModalSize[] = ["medium", "wide", "fullscreen"];
    const currentIndex = sizeOrder.indexOf(modalSize);
    const nextIndex = (currentIndex + 1) % sizeOrder.length;
    setModalSize(sizeOrder[nextIndex]);
  };

  const handleCustomSizeChange = (
    dimension: "width" | "height" | "maxWidth" | "maxHeight",
    value: string,
  ) => {
    setCustomSize((prev) => ({
      ...prev,
      [dimension]: value,
    }));
  };

  const handleUrlSubmit = () => {
    if (tempUrl.trim()) {
      setUrl(tempUrl.trim());
      setIsLoading(true);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleUrlSubmit();
    }
  };

  const currentSize = getCurrentSize();

  return (
    <div className={styles["prompt-modal-overlay"]} onClick={onClose}>
      <div
        className={styles["prompt-modal"]}
        style={{
          width: currentSize.width,
          height: currentSize.height,
          maxWidth: currentSize.maxWidth,
          maxHeight: currentSize.maxHeight,
        }}
        data-size={modalSize}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles["prompt-modal-header"]}>
          <h2 className={styles["prompt-modal-title"]}>Prompt 浏览器</h2>
          <div className={styles["prompt-modal-header-controls"]}>
            <IconButton
              icon={showControls ? <EyeOffIcon /> : <EyeIcon />}
              onClick={() => setShowControls(!showControls)}
              className={styles["prompt-modal-eye-toggle"]}
              title={showControls ? "隐藏控制栏" : "显示控制栏"}
            />
            <IconButton
              icon={
                modalSize === "fullscreen" ? <MinimizeIcon /> : <MaximizeIcon />
              }
              onClick={cycleSize}
              className={styles["prompt-modal-size-toggle"]}
              title={`切换大小 (当前: ${
                modalSize === "wide"
                  ? "宽屏"
                  : modalSize === "medium"
                  ? "中"
                  : "全屏"
              })`}
            />
            <IconButton
              icon={<CloseIcon />}
              onClick={onClose}
              className={styles["prompt-modal-close"]}
            />
          </div>
        </div>

        <div
          className={`${styles["prompt-modal-controls"]} ${
            !showControls ? styles["hidden"] : ""
          }`}
        >
          <div className={styles["prompt-url-container"]}>
            <input
              type="url"
              value={tempUrl}
              onChange={(e) => setTempUrl(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="输入网址..."
              className={styles["prompt-url-input"]}
            />
            <button
              onClick={handleUrlSubmit}
              className={styles["prompt-url-submit"]}
            >
              访问
            </button>
            <button
              onClick={() => window.open(url, "_blank")}
              className={styles["prompt-external-link"]}
              title="新窗口打开"
            >
              <ExternalLinkIcon />
            </button>
            <button
              onClick={() => setShowSizeControls(!showSizeControls)}
              className={styles["prompt-size-toggle-btn"]}
              title="自定义大小"
            >
              {modalSize === "custom" ? "自定义" : "预设"}
            </button>
          </div>

          {showSizeControls && (
            <div className={styles["prompt-size-controls"]}>
              <div className={styles["size-presets"]}>
                <label>快速选择:</label>
                {(["medium", "wide", "fullscreen"] as ModalSize[]).map(
                  (size) => (
                    <button
                      key={size}
                      onClick={() => setModalSize(size)}
                      className={`${styles["size-preset-btn"]} ${
                        modalSize === size ? styles["active"] : ""
                      }`}
                    >
                      {size === "medium"
                        ? "中"
                        : size === "wide"
                        ? "宽屏"
                        : "全屏"}
                    </button>
                  ),
                )}
                <button
                  onClick={() => setModalSize("custom")}
                  className={`${styles["size-preset-btn"]} ${
                    modalSize === "custom" ? styles["active"] : ""
                  }`}
                >
                  自定义
                </button>
              </div>

              {modalSize === "custom" && (
                <div className={styles["custom-size-inputs"]}>
                  <div className={styles["size-input-group"]}>
                    <label>宽度:</label>
                    <input
                      type="text"
                      value={customSize.width}
                      onChange={(e) =>
                        handleCustomSizeChange("width", e.target.value)
                      }
                      placeholder="如: 800px 或 90vw"
                    />
                  </div>
                  <div className={styles["size-input-group"]}>
                    <label>高度:</label>
                    <input
                      type="text"
                      value={customSize.height}
                      onChange={(e) =>
                        handleCustomSizeChange("height", e.target.value)
                      }
                      placeholder="如: 600px 或 80vh"
                    />
                  </div>
                  <div className={styles["size-input-group"]}>
                    <label>最大宽度:</label>
                    <input
                      type="text"
                      value={customSize.maxWidth || ""}
                      onChange={(e) =>
                        handleCustomSizeChange("maxWidth", e.target.value)
                      }
                      placeholder="如: 1200px (可选)"
                    />
                  </div>
                  <div className={styles["size-input-group"]}>
                    <label>最大高度:</label>
                    <input
                      type="text"
                      value={customSize.maxHeight || ""}
                      onChange={(e) =>
                        handleCustomSizeChange("maxHeight", e.target.value)
                      }
                      placeholder="如: 800px (可选)"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className={styles["prompt-modal-content"]}>
          <div className={styles["prompt-iframe-container"]}>
            {isLoading && (
              <div className={styles["prompt-loading"]}>
                <div className={styles["prompt-spinner"]}></div>
                <p>正在加载...</p>
              </div>
            )}
            <iframe
              src={url}
              className={styles["prompt-iframe"]}
              onLoad={() => setIsLoading(false)}
              onError={() => setIsLoading(false)}
              title="Prompt Content"
              allow="clipboard-read; clipboard-write;"
              sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-top-navigation allow-modals allow-orientation-lock allow-pointer-lock allow-presentation allow-downloads"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// 保持向后兼容的页面组件（如果需要的话）
export function PromptPage() {
  const [showModal, setShowModal] = useState(true);

  return (
    <>{showModal && <PromptModal onClose={() => setShowModal(false)} />}</>
  );
}
