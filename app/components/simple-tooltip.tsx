import React, { useState, useRef, useEffect, useCallback } from "react";
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
  const showTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  const showTooltip = useCallback(() => {
    // 清除之前的定时器
    if (showTimeoutRef.current) {
      clearTimeout(showTimeoutRef.current);
    }

    showTimeoutRef.current = setTimeout(() => {
      calculatePosition();
      setIsVisible(true);
      showTimeoutRef.current = null;
    }, 100);
  }, []);

  const hideTooltip = useCallback(() => {
    // 清除显示定时器
    if (showTimeoutRef.current) {
      clearTimeout(showTimeoutRef.current);
      showTimeoutRef.current = null;
    }
    setIsVisible(false);
  }, []);

  const handleMouseEnter = useCallback(() => {
    showTooltip();
  }, [showTooltip]);

  const handleMouseLeave = useCallback(() => {
    hideTooltip();
  }, [hideTooltip]);

  // 全局鼠标事件监听，确保弹框能正确隐藏
  useEffect(() => {
    if (!isVisible) return;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!elementRef.current) return;

      const rect = elementRef.current.getBoundingClientRect();
      const isOutside =
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom;

      if (isOutside) {
        hideTooltip();
      }
    };

    const handleGlobalTouchStart = (e: TouchEvent) => {
      if (!elementRef.current) return;

      const touch = e.touches[0];
      const rect = elementRef.current.getBoundingClientRect();
      const isOutside =
        touch.clientX < rect.left ||
        touch.clientX > rect.right ||
        touch.clientY < rect.top ||
        touch.clientY > rect.bottom;

      if (isOutside) {
        hideTooltip();
      }
    };

    // 添加全局事件监听
    document.addEventListener('mousemove', handleGlobalMouseMove);
    document.addEventListener('touchstart', handleGlobalTouchStart);

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('touchstart', handleGlobalTouchStart);
    };
  }, [isVisible, hideTooltip]);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (showTimeoutRef.current) {
        clearTimeout(showTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isVisible) {
      calculatePosition();
    }
  }, [isVisible]);

  return (
    <div
      ref={elementRef}
      className={styles["tooltip-container"]}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
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