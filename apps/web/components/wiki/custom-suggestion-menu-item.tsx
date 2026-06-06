import { ComponentProps, elementOverflow } from "@blocknote/react";
import { forwardRef, useEffect, useRef, type MouseEvent, type Ref } from "react";
import "./custom-suggestion-menu.css";

function mergeRefs<T>(...refs: (Ref<T> | undefined | null)[]) {
  return (value: T | null) => {
    for (const ref of refs) {
      if (typeof ref === "function") {
        ref(value);
      } else if (ref) {
        (ref as React.MutableRefObject<T | null>).current = value;
      }
    }
  };
}

export const CustomSuggestionMenuItem = forwardRef<
  HTMLDivElement,
  ComponentProps["SuggestionMenu"]["Item"]
>((props, ref) => {
  const { className, isSelected, onClick, item, id } = props;

  const itemRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!itemRef.current || !isSelected) {
      return;
    }

    const container = itemRef.current.closest(".bn-suggestion-menu, #ai-suggestion-menu");
    if (!(container instanceof HTMLElement)) {
      return;
    }

    const overflow = elementOverflow(itemRef.current, container);
    if (overflow !== "none") {
      itemRef.current.scrollIntoView({ block: "nearest" });
    }
  }, [isSelected]);

  return (
    <div
      className={`${className ?? ""} custom-suggestion-menu-item ${isSelected ? "selected" : ""}`}
      ref={mergeRefs(ref, itemRef)}
      id={id}
      role="option"
      onMouseDown={(event: MouseEvent) => {
        event.preventDefault();
      }}
      onClick={onClick}
      aria-selected={isSelected || undefined}
    >
      {item.icon && (
        <div className="bn-mt-suggestion-menu-item-section" data-position="left">
          {item.icon}
        </div>
      )}
      <div className="bn-mt-suggestion-menu-item-body">
        <span className="bn-mt-suggestion-menu-item-title">{item.title}</span>
        <span className="bn-mt-suggestion-menu-item-subtitle">{item.subtext}</span>
      </div>
      {item.badge && (
        <div className="bn-mt-suggestion-menu-item-section" data-position="right">
          <span className="bn-mt-suggestion-menu-badge">{item.badge}</span>
        </div>
      )}
    </div>
  );
});

CustomSuggestionMenuItem.displayName = "CustomSuggestionMenuItem";
