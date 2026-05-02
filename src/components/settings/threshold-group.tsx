/** 單一閾值項目 */
export interface ThresholdItem {
  label: string;
  value: number;
  suffix: string;
  desc: string;
  step?: number;
  onChange: (value: number) => void;
}

/** 閾值群組（標題 + 項目列表） */
export function ThresholdGroup({
  title,
  items,
}: {
  title: string;
  items: ThresholdItem[];
}) {
  return (
    <div>
      <h4 className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-2">
        {title}
      </h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {items.map((item) => (
          <div
            key={item.label}
            className="bg-gray-50 rounded-lg p-3 hover:bg-gray-100/80 transition-colors"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-foreground">{item.label}</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={item.value}
                  step={item.step ?? 1}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v)) item.onChange(v);
                  }}
                  className="w-16 text-right text-sm font-mono font-medium text-accent border border-gray-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-shadow"
                />
                {item.suffix && (
                  <span className="text-xs text-muted w-4">{item.suffix}</span>
                )}
              </div>
            </div>
            <p className="text-[11px] text-muted">{item.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
