import React, { useState, useMemo } from "react";
import { useAllModels } from "../utils/hooks";
import { groupBy } from "lodash-es";
import { getModelProvider } from "../utils/model";
import { Modal, ListItem } from "./ui-lib";
import styles from "./quick-model-modal.module.scss";

interface Props {
  visible: boolean;
  onClose: () => void;
  selectedModels: string[];
  onChange: (models: string[]) => void;
}

export function QuickModelModal({ visible, onClose, selectedModels, onChange }: Props) {
  const allModels = useAllModels();
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set());

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
      onChange([...selectedModels, modelValue]);
    } else {
      onChange(selectedModels.filter((m) => m !== modelValue));
    }
  };

  const selectAllInProvider = (providerName: string) => {
    const providerModels = groupModels[providerName] || [];
    const providerModelValues = providerModels.map((m) => `${m.name}@${m.provider?.providerName}`);
    const newSelectedModels = [...new Set([...selectedModels, ...providerModelValues])];
    onChange(newSelectedModels);
  };

  const deselectAllInProvider = (providerName: string) => {
    const providerModels = groupModels[providerName] || [];
    const providerModelValues = providerModels.map((m) => `${m.name}@${m.provider?.providerName}`);
    const newSelectedModels = selectedModels.filter((m) => !providerModelValues.includes(m));
    onChange(newSelectedModels);
  };

  const isProviderFullySelected = (providerName: string) => {
    const providerModels = groupModels[providerName] || [];
    const providerModelValues = providerModels.map((m) => `${m.name}@${m.provider?.providerName}`);
    return providerModelValues.every((value) => selectedModels.includes(value));
  };

  const isProviderPartiallySelected = (providerName: string) => {
    const providerModels = groupModels[providerName] || [];
    const providerModelValues = providerModels.map((m) => `${m.name}@${m.provider?.providerName}`);
    const selectedCount = providerModelValues.filter((value) => selectedModels.includes(value)).length;
    return selectedCount > 0 && selectedCount < providerModelValues.length;
  };

  const getSelectedModelsDisplay = () => {
    if (selectedModels.length === 0) return "未选择模型";
    if (selectedModels.length <= 3) {
      return selectedModels.map((modelStr) => {
        const [model, providerName] = getModelProvider(modelStr);
        const modelData = allModels.find(
          (m) => m.name === model && m?.provider?.providerName === providerName
        );
        return modelData?.displayName || model;
      }).join(", ");
    }
    return `已选择 ${selectedModels.length} 个模型`;
  };

  if (!visible) return null;

  return (
    <div className={styles["modal-overlay"]} onClick={onClose}>
      <div className={styles["modal-content"]} onClick={(e) => e.stopPropagation()}>
        <div className={styles["modal-header"]}>
          <h3>快捷切换模型配置</h3>
          <button className={styles["close-btn"]} onClick={onClose}>×</button>
        </div>

        <div className={styles["selected-summary"]}>
          <div className={styles["summary-label"]}>当前选择：</div>
          <div className={styles["summary-content"]}>{getSelectedModelsDisplay()}</div>
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
                        onClick={() => {
                          if (isFullySelected) {
                            deselectAllInProvider(providerName);
                          } else {
                            selectAllInProvider(providerName);
                          }
                        }}
                      />
                      <span className={styles["provider-name"]}>{providerName}</span>
                      <span className={styles["model-count"]}>({models.length})</span>
                    </div>
                    <div className={`${styles["expand-icon"]} ${isExpanded ? styles["expanded"] : ""}`}>
                      ▼
                    </div>
                  </div>

                  {isExpanded && (
                    <div className={styles["model-list"]}>
                      {models.map((model, index) => {
                        const modelValue = `${model.name}@${model.provider?.providerName}`;
                        const isSelected = selectedModels.includes(modelValue);

                        return (
                          <div
                            key={index}
                            className={`${styles["model-item"]} ${isSelected ? styles["selected"] : ""}`}
                            onClick={() => toggleModel(modelValue, !isSelected)}
                          >
                            <div
                              className={`${styles.checkbox} ${isSelected ? styles.checked : ''}`}
                              onClick={() => toggleModel(modelValue, !isSelected)}
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
          <button
            className={styles["clear-btn"]}
            onClick={() => onChange([])}
            disabled={selectedModels.length === 0}
          >
            清空选择
          </button>
          <div className={styles["selected-count"]}>
            已选择 {selectedModels.length} 个模型
          </div>
          <button className={styles["confirm-btn"]} onClick={onClose}>
            确定
          </button>
        </div>
      </div>
    </div>
  );
}