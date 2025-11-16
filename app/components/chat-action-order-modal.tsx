import { useState, useEffect, useRef, useCallback } from "react";
import { useAppConfig } from "../store";
import styles from "./chat-action-order-modal.module.scss";
import { IconButton } from "./button";
import { Modal } from "./ui-lib";
import ResetIcon from "../icons/reload.svg";
import Locale from "../locales";

// 导入所有需要的图标
import StopIcon from "../icons/pause.svg";
import BottomIcon from "../icons/bottom.svg";
import SettingsIcon from "../icons/chat-settings.svg";
import ImageIcon from "../icons/image.svg";
import LightIcon from "../icons/light.svg";
import DarkIcon from "../icons/dark.svg";
import AutoIcon from "../icons/auto.svg";
import PromptIcon from "../icons/prompt.svg";
import MaskIcon from "../icons/mask.svg";
import BreakIcon from "../icons/break.svg";
import ReloadIcon from "../icons/reload.svg";
import RobotIcon from "../icons/robot.svg";
import SizeIcon from "../icons/size.svg";
import QualityIcon from "../icons/hd.svg";
import StyleIcon from "../icons/palette.svg";
import PluginIcon from "../icons/plugin.svg";
import ShortcutkeyIcon from "../icons/shortcutkey.svg";
import McpToolIcon from "../icons/tool.svg";

interface ChatActionOrderModalProps {
  onClose: () => void;
}

// 定义所有可排序的按钮及其图标
const ALL_ACTIONS = [
  { key: "stop", name: Locale.Settings.ChatActionOrder.Stop, visibilityKey: "showStop", icon: StopIcon },
  { key: "toBottom", name: Locale.Settings.ChatActionOrder.ToBottom, visibilityKey: "showToBottom", icon: BottomIcon },
  { key: "settings", name: Locale.Settings.ChatActionOrder.Settings, visibilityKey: "showSettings", icon: SettingsIcon },
  { key: "imageUpload", name: Locale.Settings.ChatActionOrder.ImageUpload, visibilityKey: "showImageUpload", icon: ImageIcon },
  { key: "themeSwitch", name: Locale.Settings.ChatActionOrder.ThemeSwitch, visibilityKey: "showThemeSwitch", icon: AutoIcon },
  { key: "historyCount", name: Locale.Settings.ChatActionOrder.HistoryCount, visibilityKey: "showHistoryCount", icon: null },
  { key: "promptLibrary", name: Locale.Settings.ChatActionOrder.PromptLibrary, visibilityKey: "showPromptLibrary", icon: PromptIcon },
  { key: "masks", name: Locale.Settings.ChatActionOrder.Masks, visibilityKey: "showMasks", icon: MaskIcon },
  { key: "clearContext", name: Locale.Settings.ChatActionOrder.ClearContext, visibilityKey: "showClearContext", icon: BreakIcon },
  { key: "quickSwitch", name: Locale.Settings.ChatActionOrder.QuickSwitch, visibilityKey: "showQuickSwitch", icon: ReloadIcon },
  { key: "modelSelector", name: Locale.Settings.ChatActionOrder.ModelSelector, visibilityKey: "showModelSelector", icon: RobotIcon },
  { key: "sizeSelector", name: Locale.Settings.ChatActionOrder.SizeSelector, visibilityKey: "showSizeSelector", icon: SizeIcon },
  { key: "qualitySelector", name: Locale.Settings.ChatActionOrder.QualitySelector, visibilityKey: "showQualitySelector", icon: QualityIcon },
  { key: "styleSelector", name: Locale.Settings.ChatActionOrder.StyleSelector, visibilityKey: "showStyleSelector", icon: StyleIcon },
  { key: "pluginSelector", name: Locale.Settings.ChatActionOrder.PluginSelector, visibilityKey: "showPluginSelector", icon: PluginIcon },
  { key: "shortcutKey", name: Locale.Settings.ChatActionOrder.ShortcutKey, visibilityKey: "showShortcutKey", icon: ShortcutkeyIcon },
  { key: "mcpTools", name: Locale.Settings.ChatActionOrder.McpTools, visibilityKey: "showMcpTools", icon: McpToolIcon },
];

const DEFAULT_ORDER = [
  "stop",
  "toBottom",
  "settings",
  "imageUpload",
  "themeSwitch",
  "historyCount",
  "promptLibrary",
  "masks",
  "clearContext",
  "quickSwitch",
  "modelSelector",
  "sizeSelector",
  "qualitySelector",
  "styleSelector",
  "pluginSelector",
  "shortcutKey",
  "mcpTools",
];

export function ChatActionOrderModal({ onClose }: ChatActionOrderModalProps) {
  const config = useAppConfig();
  const [draggedItem, setDraggedItem] = useState<{
    action: typeof ALL_ACTIONS[0];
    fromSide: 'available' | 'selected';
    index: number;
  } | null>(null);
  const [dragOverInfo, setDragOverInfo] = useState<{
    side: 'available' | 'selected';
    index: number;
    position: 'above' | 'below';
  } | null>(null);

  // 获取按钮的显示状态
  const getVisibility = (visibilityKey: string) => {
    const key = visibilityKey as keyof typeof config.chatActionVisibility;
    return config.chatActionVisibility[key] || false;
  };

  // 获取已选中的工具
  const getSelectedTools = () => {
    return config.chatActionOrder
      .filter(actionKey => {
        const action = ALL_ACTIONS.find(a => a.key === actionKey);
        return action && getVisibility(action.visibilityKey);
      })
      .map(actionKey => ALL_ACTIONS.find(a => a.key === actionKey))
      .filter(Boolean) as typeof ALL_ACTIONS;
  };

  // 获取未选中的工具
  const getAvailableTools = () => {
    return ALL_ACTIONS.filter(action => !getVisibility(action.visibilityKey));
  };

  // 切换工具显示状态
  const toggleTool = useCallback((action: typeof ALL_ACTIONS[0]) => {
    const key = action.visibilityKey as keyof typeof config.chatActionVisibility;
    config.update((config) => {
      config.chatActionVisibility[key] = !config.chatActionVisibility[key];
    });
  }, [config]);

  // 重新排序工具
  const reorderTools = useCallback((fromIndex: number, toIndex: number) => {
    const selectedTools = getSelectedTools();
    if (fromIndex < 0 || fromIndex >= selectedTools.length || toIndex < 0 || toIndex >= selectedTools.length) {
      return;
    }

    const newOrder = [...selectedTools];
    const [movedItem] = newOrder.splice(fromIndex, 1);
    newOrder.splice(toIndex, 0, movedItem);

    config.update((config) => {
      // 更新完整的order数组，保持未选中的工具位置不变
      const newFullOrder = config.chatActionOrder.filter(key => {
        const action = ALL_ACTIONS.find(a => a.key === key);
        return action && !getVisibility(action.visibilityKey);
      });

      // 在适当的位置插入已选中的工具
      const insertIndex = config.chatActionOrder.findIndex(key => {
        const action = ALL_ACTIONS.find(a => a.key === key);
        return action && getVisibility(action.visibilityKey);
      });

      if (insertIndex !== -1) {
        newFullOrder.splice(insertIndex, 0, ...newOrder.map(a => a.key));
      }

      config.chatActionOrder = newFullOrder;
    });
  }, [config, getSelectedTools, getVisibility]);

  // 重置为默认设置
  const resetToDefault = () => {
    config.update((config) => {
      // 重置为默认的可见性设置
      config.chatActionVisibility = {
        showStop: true,
        showToBottom: true,
        showSettings: true,
        showImageUpload: true,
        showThemeSwitch: true,
        showHistoryCount: false,
        showPromptLibrary: false,
        showMasks: false,
        showClearContext: false,
        showQuickSwitch: false,
        showModelSelector: true,
        showSizeSelector: true,
        showQualitySelector: true,
        showStyleSelector: true,
        showPluginSelector: true,
        showShortcutKey: false,
        showMcpTools: true,
      };
      config.chatActionOrder = [...DEFAULT_ORDER];
    });
  };

  const saveSettings = () => {
    onClose();
  };

  // 拖拽开始
  const handleDragStart = (e: React.DragEvent, action: typeof ALL_ACTIONS[0], fromSide: 'available' | 'selected', index: number) => {
    setDraggedItem({ action, fromSide, index });
    e.dataTransfer.effectAllowed = 'move';

    // 创建拖拽图像
    const dragImage = e.currentTarget.cloneNode(true) as HTMLElement;
    dragImage.style.opacity = '0.8';
    dragImage.style.transform = 'rotate(2deg)';
    dragImage.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.2)';
    document.body.appendChild(dragImage);

    // 获取鼠标相对于拖拽元素的位置
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;

    e.dataTransfer.setDragImage(dragImage, offsetX, offsetY);
    setTimeout(() => document.body.removeChild(dragImage), 0);
  };

  // 拖拽结束
  const handleDragEnd = () => {
    setDraggedItem(null);
    setDragOverInfo(null);
  };

  // 拖拽悬停
  const handleDragOver = (e: React.DragEvent, side: 'available' | 'selected', index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const rect = e.currentTarget.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    const position = e.clientY < midpoint ? 'above' : 'below';

    setDragOverInfo({ side, index, position });
  };

  // 拖拽离开
  const handleDragLeave = () => {
    setDragOverInfo(null);
  };

  // 拖拽放置
  const handleDrop = (e: React.DragEvent, side: 'available' | 'selected', index: number) => {
    e.preventDefault();
    setDragOverInfo(null);

    if (!draggedItem) return;

    // 如果拖拽到可用区域
    if (side === 'available') {
      // 如果是从已选区域拖过来的，则隐藏该工具
      if (draggedItem.fromSide === 'selected') {
        toggleTool(draggedItem.action);
      }
      return;
    }

    // 如果拖拽到已选区域
    if (side === 'selected') {
      // 如果是从可用区域拖过来的，则显示该工具
      if (draggedItem.fromSide === 'available') {
        toggleTool(draggedItem.action);
      } else if (draggedItem.fromSide === 'selected') {
        // 在已选区域内重新排序
        const targetIndex = dragOverInfo?.position === 'below' ? index + 1 : index;
        reorderTools(draggedItem.index, targetIndex);
      }
    }
  };

  const selectedTools = getSelectedTools();
  const availableTools = getAvailableTools();

  // 渲染工具项
  const renderToolItem = (action: typeof ALL_ACTIONS[0], side: 'available' | 'selected', index: number) => {
    const isDraggedOver = dragOverInfo?.side === side && dragOverInfo?.index === index;
    const dropPosition = dragOverInfo?.position;

    return (
      <div
        key={action.key}
        className={`${styles["tool-item"]} ${isDraggedOver ? styles["drag-over"] : ""}`}
        draggable
        onDragStart={(e) => handleDragStart(e, action, side, index)}
        onDragEnd={handleDragEnd}
        onDragOver={(e) => handleDragOver(e, side, index)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, side, index)}
        onClick={() => toggleTool(action)}
      >
        <div className={styles["tool-icon"]}>
          {action.icon ? <action.icon /> : '📝'}
        </div>
        <span className={styles["tool-name"]}>{action.name}</span>
        {side === 'available' && (
          <button
            className={styles["add-button"]}
            onClick={(e) => {
              e.stopPropagation();
              toggleTool(action);
            }}
            title={`启用 ${action.name}`}
          >
            +
          </button>
        )}

        {/* 拖拽指示器 */}
        {isDraggedOver && dropPosition === 'above' && (
          <div className={styles["drop-indicator"] + " " + styles["top"]} />
        )}
        {isDraggedOver && dropPosition === 'below' && (
          <div className={styles["drop-indicator"] + " " + styles["bottom"]} />
        )}
      </div>
    );
  };

  return (
    <div className="modal-mask">
      <Modal
        title={Locale.Settings.ChatActionManagement.Title}
        onClose={onClose}
        actions={[
          <IconButton
            key="reset"
            icon={<ResetIcon />}
            onClick={resetToDefault}
            text={Locale.Settings.ChatActionOrder.Reset}
          />,
          <IconButton
            key="cancel"
            text={Locale.UI.Cancel}
            onClick={onClose}
          />,
          <IconButton
            key="save"
            type="primary"
            text={Locale.UI.Confirm}
            onClick={saveSettings}
          />,
        ]}
      >
        <div className={styles["split-container"]}>
          {/* 左侧：可用工具 */}
          <div className={styles["available-section"]}>
            <div className={styles["section-header"]}>
              <h3>{Locale.Settings.ChatActionManagement.AvailableTools || "可用工具"}</h3>
              <span className={styles["tool-count"]}>
                {availableTools.length} {Locale.Settings.ChatActionManagement.Tools || "个工具"}
              </span>
            </div>
            <div className={styles["tools-list"]}>
              {availableTools.length > 0 ? (
                availableTools.map((action, index) => renderToolItem(action, 'available', index))
              ) : (
                <div className={styles["empty-state"]}>
                  {Locale.Settings.ChatActionManagement.NoAvailableTools || "没有可用工具"}
                </div>
              )}
            </div>
          </div>

          {/* 右侧：已选工具 */}
          <div className={styles["selected-section"]}>
            <div className={styles["section-header"]}>
              <h3>{Locale.Settings.ChatActionManagement.SelectedTools || "已选工具"}</h3>
              <span className={styles["tool-count"]}>
                {selectedTools.length} / {ALL_ACTIONS.length} {Locale.Settings.ChatActionManagement.Visible || "个可见"}
              </span>
            </div>
            <div className={styles["tools-list"]}>
              {selectedTools.length > 0 ? (
                selectedTools.map((action, index) => renderToolItem(action, 'selected', index))
              ) : (
                <div className={styles["empty-state"]}>
                  <div className={styles["empty-icon"]}>📋</div>
                  <div>{Locale.Settings.ChatActionManagement.NoSelectedTools || "拖拽工具到此处"}</div>
                  <div className={styles["empty-hint"]}>
                    {Locale.Settings.ChatActionManagement.DragHint || "从左侧拖拽工具到此处进行添加"}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}