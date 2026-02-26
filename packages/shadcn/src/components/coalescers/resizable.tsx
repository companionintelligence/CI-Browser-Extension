import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "../ui/resizable";

type ResizableComponent = typeof ResizablePanelGroup & {
  Panel: typeof ResizablePanel;
  Handle: typeof ResizableHandle;
};

const Resizable = ResizablePanelGroup as ResizableComponent;

Resizable.Panel = ResizablePanel;
Resizable.Handle = ResizableHandle;

export { Resizable };
