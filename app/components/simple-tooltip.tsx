import React, { useState, useRef, useEffect } from "react";
import styles from "./tooltip.module.scss";

interface SimpleTooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;
  placement?: "top" | "bottom" | "left" | "right";
}

export function SimpleTooltip({ content, children, placement = "top" }: SimpleTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const elementRef = useRef<HTMLDivElement>(null);

  const tooltipStyle = {
    position: "fixed" as const,
    top: `${position.top}px`,
    left: `${position.left}px`,
    zIndex: 9999,
    background: "rgba(117, 117, 117, 0.38)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    color: "#3eecacff",
    padding: "16px 20px",
    borderRadius: "12px",
    fontSize: "13px",
    lineHeight: "1.5",
    maxWidth: "320px",
    boxShadow: "0 12px 32px rgba(0, 0, 0, 0.1)",
    border: "1px solid rgba(255, 255, 255, 0.12)",
    pointerEvents: "none" as const,
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    animation: "fadeIn 0.2s ease-out",
  };

  const calculatePosition = () => {
    // 在屏幕中间显示
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const scrollY = window.pageYOffset;
    const scrollX = window.pageXOffset;

    // 预估tooltip尺寸
    const tooltipWidth = 320;
    const tooltipHeight = 160;

    const top = scrollY + (viewportHeight - tooltipHeight) / 2;
    const left = scrollX + (viewportWidth - tooltipWidth) / 2;

    setPosition({ top, left });
  };

  const showTooltip = () => {
    setTimeout(() => {
      calculatePosition();
      setIsVisible(true);
    }, 100);
  };

  const hideTooltip = () => {
    setIsVisible(false);
  };

  useEffect(() => {
    if (isVisible) {
      calculatePosition();
    }
  }, [isVisible]);

  return (
    <div
      ref={elementRef}
      className={styles["tooltip-container"]}
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
    >
      {children}
      {isVisible && (
        <div style={tooltipStyle}>
          {content}
          <style jsx>{`
            @keyframes fadeIn {
              from {
                opacity: 0;
                transform: translateY(-4px);
              }
              to {
                opacity: 1;
                transform: translateY(0);
              }
            }
          `}</style>
        </div>
      )}
    </div>
  );
}