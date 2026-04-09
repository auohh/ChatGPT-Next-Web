import { ChatAction } from "../chat";
import Locale from "../../locales";
import CompareIconEnabled from "../../icons/compare.svg";

// 未激活的对比图标（带左上→右下斜线）
function CompareIconDisabled() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 16 16">
      {/* 原始对比图标 */}
      <g opacity="1">
        <rect width="6" height="8" x="1.5" y="4" rx="1" fill="none" stroke="#333" strokeWidth="1.333"/>
        <rect width="6" height="8" x="8.5" y="4" rx="1" fill="none" stroke="#333" strokeWidth="1.333"/>
        <path stroke="#333" strokeWidth="1.333" d="M4.5 2L4.5 4"/>
        <path stroke="#333" strokeWidth="1.333" d="M11.5 2L11.5 4"/>
      </g>
      {/* 斜线：左上 → 右下 */}
      <line x1="2" y1="2" x2="14" y2="14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  );
}

interface CompareModeButtonProps {
  isEnabled: boolean;
  selectedModels: string[];
  onToggle: () => void;
  onModelSelect: (models: string[]) => void;
}

export function CompareModeButton({
  isEnabled,
  selectedModels,
  onToggle,
  onModelSelect,
}: CompareModeButtonProps) {
  const getText = () => {
    if (isEnabled && selectedModels.length > 0) {
      return Locale.Compare.ActiveCount(selectedModels.length);
    }
    return Locale.Compare.EnterMode;
  };

  return (
    <ChatAction
      text={getText()}
      icon={isEnabled ? <CompareIconEnabled /> : <CompareIconDisabled />}
      onClick={() => onModelSelect(selectedModels)}
    />
  );
}
