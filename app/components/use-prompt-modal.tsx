import { createContext, useContext, useState, ReactNode } from "react";

interface PromptModalContextType {
  showPromptModal: boolean;
  openPromptModal: () => void;
  closePromptModal: () => void;
}

const PromptModalContext = createContext<PromptModalContextType | undefined>(
  undefined,
);

export function PromptModalProvider({ children }: { children: ReactNode }) {
  const [showPromptModal, setShowPromptModal] = useState(false);

  const openPromptModal = () => setShowPromptModal(true);
  const closePromptModal = () => setShowPromptModal(false);

  return (
    <PromptModalContext.Provider
      value={{ showPromptModal, openPromptModal, closePromptModal }}
    >
      {children}
    </PromptModalContext.Provider>
  );
}

export function usePromptModal() {
  const context = useContext(PromptModalContext);
  if (context === undefined) {
    throw new Error("usePromptModal must be used within a PromptModalProvider");
  }
  return context;
}
