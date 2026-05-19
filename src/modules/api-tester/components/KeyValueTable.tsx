import type { KeyValuePair } from "../types";
import { HugeiconsIcon } from "@hugeicons/react";
import { Delete01Icon, PlusSignIcon } from "@hugeicons/core-free-icons";

function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

export function KeyValueTable({
  items,
  onChange,
}: {
  items: KeyValuePair[];
  onChange: (items: KeyValuePair[]) => void;
}) {
  const handleChange = (id: string, field: keyof KeyValuePair, value: any) => {
    onChange(items.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  };

  const handleAdd = () => {
    onChange([...items, { id: generateId(), key: "", value: "", enabled: true }]);
  };

  const handleRemove = (id: string) => {
    onChange(items.filter((item) => item.id !== id));
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="rounded border border-border overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-muted/50 text-muted-foreground border-b border-border">
            <tr>
              <th className="w-8 p-2"></th>
              <th className="p-2 border-l border-border">Key</th>
              <th className="p-2 border-l border-border">Value</th>
              <th className="w-8 p-2 border-l border-border"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-border last:border-0 group">
                <td className="p-2 text-center">
                  <input
                    type="checkbox"
                    checked={item.enabled}
                    onChange={(e) => handleChange(item.id, "enabled", e.target.checked)}
                    className="cursor-pointer"
                  />
                </td>
                <td className="p-0 border-l border-border relative">
                  <input
                    type="text"
                    value={item.key}
                    onChange={(e) => handleChange(item.id, "key", e.target.value)}
                    placeholder="Key"
                    className="w-full bg-transparent p-2 outline-none placeholder:text-muted-foreground/50"
                  />
                </td>
                <td className="p-0 border-l border-border relative">
                  <input
                    type="text"
                    value={item.value}
                    onChange={(e) => handleChange(item.id, "value", e.target.value)}
                    placeholder="Value"
                    className="w-full bg-transparent p-2 outline-none placeholder:text-muted-foreground/50"
                  />
                </td>
                <td className="p-2 border-l border-border text-center">
                  <button
                    onClick={() => handleRemove(item.id)}
                    className="text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-red-500"
                  >
                    <HugeiconsIcon icon={Delete01Icon} size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <button
          onClick={handleAdd}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-1"
        >
          <HugeiconsIcon icon={PlusSignIcon} size={12} /> Add Row
        </button>
      </div>
    </div>
  );
}
