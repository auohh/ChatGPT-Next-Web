import React, { useState, useMemo, useEffect } from "react";
import { useAllModels } from "../../utils/hooks";
import { groupBy } from "lodash-es";
import { showToast } from "../ui-lib";
import Locale from "../../locales";
import styles from "./CompareModelSelector.module.scss";

interface Props {
  visible: boolean;
  onClose: () => void;
  selectedModels: string[];
  enabled: boolean;
  maxModels?: number;
  minModels?: number;
  onChange: (models: string[]) => void;
  onEnabledChange: (enabled: boolean) => void;
}

export function CompareModelSelector({
  visible,
  onClose,
  selectedModels,
  enabled,
  maxModels = 6,
  minModels = 2,
  onChange,
  onEnabledChange,
}: Props) {
  const allModels = useAllModels();
  // 默认折叠所有 Provider
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(() => new Set());

  const groupModels = useMemo(() => {
    return groupBy(
      allModels.filter((v) => v.available),
      "provider.providerName"
    );
  }, [allModels]);

  const toggleProvider = (providerName: string) => {
    setExpandedProviders((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(providerName)) {
        newSet.delete(providerName);
      } else {
        newSet.add(providerName);
      }
      return newSet;
    });
  };

  const toggleModel = (modelValue: string, checked: boolean) => {
    if (checked) {
      if (selectedModels.length >= maxModels) {
        showToast(Locale.Compare.MaxModels);
        return;
      }
      onChange([...selectedModels, modelValue]);
    } else {
      onChange(selectedModels.filter((m) => m !== modelValue));
    }
  };

  const selectAllInProvider = (providerName: string) => {
    const providerModels = groupModels[providerName] || [];
    const providerModelValues = providerModels.map((m) => `${m.name}@${m?.provider?.providerName}`);
    const currentSelected = selectedModels.filter((m) => !providerModelValues.includes(m));
    const availableSlots = maxModels - currentSelected.length;
    const toAdd = providerModelValues.slice(0, Math.max(0, availableSlots));
    const newSelectedModels = [...new Set([...currentSelected, ...toAdd])];
    onChange(newSelectedModels);

    if (providerModelValues.length > availableSlots) {
      showToast(Locale.Compare.MaxModels);
    }
  };

  const deselectAllInProvider = (providerName: string) => {
    const providerModels = groupModels[providerName] || [];
    const providerModelValues = providerModels.map((m) => `${m.name}@${m?.provider?.providerName}`);
    const newSelectedModels = selectedModels.filter((m) => !providerModelValues.includes(m));
    onChange(newSelectedModels);
  };

  const isProviderFullySelected = (providerName: string) => {
    const providerModels = groupModels[providerName] || [];
    const providerModelValues = providerModels.map((m) => `${m.name}@${m?.provider?.providerName}`);
    return providerModelValues.every((value) => selectedModels.includes(value));
  };

  const isProviderPartiallySelected = (providerName: string) => {
    const providerModels = groupModels[providerName] || [];
    const providerModelValues = providerModels.map((m) => `${m.name}@${m?.provider?.providerName}`);
    const selectedCount = providerModelValues.filter((value) => selectedModels.includes(value)).length;
    return selectedCount > 0 && selectedCount < providerModelValues.length;
  };

  const getSelectedModelDisplayName = (modelValue: string) => {
    const [modelName] = modelValue.split("@");
    const found = allModels.find((m) => m.name === modelName);
    return found?.displayName ?? modelName;
  };

  const removeSelectedModel = (modelValue: string) => {
    onChange(selectedModels.filter((m) => m !== modelValue));
  };

  const handleConfirm = () => {
    if (!enabled) {
      onClose();
      return;
    }
    if (selectedModels.length < minModels) {
      showToast(Locale.Compare.MinModels);
      return;
    }
    onClose();
  };

  // Fix 4: Escape key to close modal
  useEffect(() => {
    if (!visible) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [visible, onClose]);

  if (!visible) return null;

  return (
    <div className={styles["modal-overlay"]} onClick={onClose}>
      <div className={styles["modal-content"]} onClick={(e) => e.stopPropagation()}>
        <div className={styles["modal-header"]}>
          <h3>{Locale.Compare.SelectModels}</h3>
          <div className={styles["header-actions"]}>
            <label className={styles["toggle-switch"]}>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => onEnabledChange(e.target.checked)}
              />
              <span className={styles["toggle-slider"]} />
              <span className={styles["toggle-label"]}>
                {enabled ? Locale.Compare.Enabled : Locale.Compare.Disabled}
              </span>
            </label>
            <button className={styles["close-btn"]} onClick={onClose}>×</button>
          </div>
        </div>

        <div className={styles["selected-tags"]}>
          {selectedModels.length === 0 && (
            <span className={styles["tags-placeholder"]}>{Locale.Compare.SelectModels}</span>
          )}
          {selectedModels.map((modelValue) => (
            <span
              key={modelValue}
              className={styles["tag"]}
              onClick={() => removeSelectedModel(modelValue)}
            >
              <span className={styles["tag-name"]}>{getSelectedModelDisplayName(modelValue)}</span>
              <span className={styles["tag-remove"]}>×</span>
            </span>
          ))}
          <span className={styles["tags-hint"]}>
            {selectedModels.length}/{maxModels}
          </span>
        </div>

        <div className={styles["modal-body"]}>
          <div className={styles["provider-list"]}>
            {Object.keys(groupModels).map((providerName) => {
              const models = groupModels[providerName] || [];
              const isExpanded = expandedProviders.has(providerName);
              const isFullySelected = isProviderFullySelected(providerName);
              const isPartiallySelected = isProviderPartiallySelected(providerName);

              return (
                <div key={providerName} className={styles["provider-group"]}>
                  <div
                    className={styles["provider-header"]}
                    onClick={() => toggleProvider(providerName)}
                  >
                    <div className={styles["provider-title"]}>
                      <div
                        className={`${styles.checkbox} ${isFullySelected ? styles.checked : ''} ${isPartiallySelected && !isFullySelected ? styles.indeterminate : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isFullySelected || (isPartiallySelected && selectedModels.length >= maxModels)) {
                            deselectAllInProvider(providerName);
                          } else {
                            selectAllInProvider(providerName);
                          }
                        }}
                      />
                      <span className={styles["provider-name"]}>{providerName}</span>
                      <span className={styles["model-count"]}>({models.length})</span>
                    </div>
                    <div className={`${styles["expand-icon"]} ${isExpanded ? styles.expanded : ""}`}>
                      ▼
                    </div>
                  </div>

                  {isExpanded && (
                    <div className={styles["model-list"]}>
                      {models.map((model, index) => {
                        const modelValue = `${model.name}@${model.provider?.providerName}`;
                        const isSelected = selectedModels.includes(modelValue);
                        const canSelect = selectedModels.length < maxModels || isSelected;

                        return (
                          <div
                            key={index}
                            className={`${styles["model-item"]} ${isSelected ? styles.selected : ""} ${!canSelect ? styles.disabled : ""}`}
                            onClick={() => canSelect && toggleModel(modelValue, !isSelected)}
                            title={!canSelect ? `已达上限 (${selectedModels.length}/${maxModels})` : undefined}
                          >
                            <div
                              className={`${styles.checkbox} ${isSelected ? styles.checked : ''}`}
                            />
                            <div className={styles["model-info"]}>
                              <div className={styles["model-name"]}>{model.displayName}</div>
                              <div className={styles["model-id"]}>{model.name}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className={styles["modal-footer"]}>
          <div className={styles["selected-count"]}>
            {selectedModels.length}/{maxModels}
          </div>
          <button className={styles["confirm-btn"]} onClick={handleConfirm}>
            {enabled ? Locale.UI.Confirm : Locale.UI.Cancel}
          </button>
        </div>
      </div>
    </div>
  );
}
