import { useEffect, useRef, type ReactNode } from "react";
import { X } from "@phosphor-icons/react";
export function Dialog({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const prior = document.activeElement as HTMLElement;
    ref.current?.showModal();
    return () => {
      ref.current?.close();
      prior?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? "wide" : ""}
      aria-labelledby="dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header>
        <div>
          <small>玄枢行动 / 体验演示</small>
          <h2 id="dialog-title">{title}</h2>
        </div>
        <button aria-label="关闭对话框" onClick={onClose}>
          <X />
        </button>
      </header>
      {children}
    </dialog>
  );
}
