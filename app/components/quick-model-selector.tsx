import React, { useState, useMemo } from "react";
import { useAllModels } from "../utils/hooks";
import { groupBy } from "lodash-es";
import { getModelProvider } from "../utils/model";
import styles from "./quick-model-selector.module.scss";

interface Props {
  selectedModels: string[];
  onChange: (models: string[]) => void;
}

export function QuickModelSelector({ selectedModels, onChange }: Props) {
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

  const CustomCheckbox = ({ checked, onChange, indeterminate = false, ...props }: any) => (
    <div
      className={`${styles.checkbox} ${checked ? styles.checked : ''} ${indeterminate && !checked ? styles.indeterminate : ''}`}
      onClick={() => onChange?.(!checked)}
      {...props}
    >
      {checked && (
        <svg className={styles.checkIcon} viewBox="0 0 16 16" fill="currentColor">
          <path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/>
        </svg>
      )}
      {indeterminate && !checked && (
        <svg className={styles.indeterminateIcon} viewBox="0 0 16 16" fill="currentColor">
          <path d="M4 8a1 1 0 0 1 1-1h6a1 1 0 0 1 0 2H5a1 1 0 0 1-1-1z"/>
        </svg>
      )}
    </div>
  );

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

  return (
    <div className={styles["quick-model-selector"]}>
      <div className={styles["selected-display"]}>
        <strong>当前选择：</strong> {getSelectedModelsDisplay()}
      </div>

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
                  <CustomCheckbox
                    checked={isFullySelected}
                    indeterminate={isPartiallySelected}
                    onChange={(checked: boolean) => {
                      if (checked) {
                        selectAllInProvider(providerName);
                      } else {
                        deselectAllInProvider(providerName);
                      }
                    }}
                    onClick={(e: React.MouseEvent) => e.stopPropagation()}
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
                      <div key={index} className={styles["model-item"]}>
                        <CustomCheckbox
                          checked={isSelected}
                          onChange={(checked: boolean) => toggleModel(modelValue, checked)}
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

      <div className={styles["actions"]}>
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
      </div>
    </div>
  );
}