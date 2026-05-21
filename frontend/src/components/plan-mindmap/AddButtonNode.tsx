import { Handle, Position, type NodeProps } from "@xyflow/react";

export type AddButtonNodeData = {
  label?: string;
};

export function AddButtonNode({ data, selected }: NodeProps) {
  const d = data as AddButtonNodeData;
  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        className="!top-1/2 !-translate-y-1/2 !h-0 !w-0 !opacity-0"
      />
      <div
        className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border-2 border-dashed text-lg font-light transition ${
          selected
            ? "border-sky-400 bg-sky-950/80 text-sky-300"
            : "border-zinc-600 bg-zinc-900/90 text-zinc-300 hover:border-sky-500/60 hover:text-sky-300"
        }`}
        aria-label={d.label ?? "Add"}
      >
        +
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!top-1/2 !-translate-y-1/2 !h-0 !w-0 !opacity-0"
      />
    </>
  );
}
