import React, { useState, useRef } from "react";
import styles from "./tooltip.module.scss";

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;
  placement?: "top" | "bottom" | "left" | "right";
  delay?: number;
  className?: string;
}

export function Tooltip({ content, children, placement = "top", delay = 300, className = "" }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const timeoutRef = useRef<NodeJS.Timeout>();
  const elementRef = useRef<HTMLDivElement>(null);

  const showTooltip = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      if (elementRef.current) {
        const rect = elementRef.current.getBoundingClientRect();
        const scrollY = window.pageYOffset;
        const scrollX = window.pageXOffset;

        // 预估tooltip尺寸
        const tooltipWidth = 250;
        const tooltipHeight = 120;

        let top = 0;
        let left = 0;

        switch (placement) {
          case "top":
            top = rect.top + scrollY - tooltipHeight - 8;
            left = rect.left + scrollX + (rect.width - tooltipWidth) / 2;
            break;
          case "bottom":
            top = rect.bottom + scrollY + 8;
            left = rect.left + scrollX + (rect.width - tooltipWidth) / 2;
            break;
          case "left":
            top = rect.top + scrollY + (rect.height - tooltipHeight) / 2;
            left = rect.left + scrollX - tooltipWidth - 8;
            break;
          case "right":
            top = rect.top + scrollY + (rect.height - tooltipHeight) / 2;
            left = rect.right + scrollX + 8;
            break;
        }

        // 确保tooltip不会超出视窗边界
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const margin = 8;

        if (left < scrollX + margin) {
          left = scrollX + margin;
        } else if (left + tooltipWidth > scrollX + viewportWidth - margin) {
          left = scrollX + viewportWidth - tooltipWidth - margin;
        }

        if (top < scrollY + margin) {
          top = scrollY + margin;
        } else if (top + tooltipHeight > scrollY + viewportHeight - margin) {
          top = scrollY + viewportHeight - tooltipHeight - margin;
        }

        setPosition({ top, left });
        setIsVisible(true);
      }
    }, delay);
  };

  const hideTooltip = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsVisible(false);
  };

  return (
    <div
      ref={elementRef}
      className={styles["tooltip-container"]}
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
    >
      {children}
      {isVisible && (
        <div
          className={`${styles["tooltip-content"]} ${styles[placement]} ${className}`}
          style={{
            position: "absolute",
            top: `${position.top}px`,
            left: `${position.left}px`,
            zIndex: 9999,
          }}
        >
          {content}
          <div className={styles["tooltip-arrow"]} />
        </div>
      )}
    </div>
  );
}