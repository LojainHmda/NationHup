import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "lucide-react";

export function DeliveryDates() {
  const [dates, setDates] = useState<string[]>(["2026-09-01", "2026-10-01"]);
  const [detailedAll, setDetailedAll] = useState(false);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "Select date";
    const date = new Date(dateStr);
    const day = date.getDate();
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    return `${day} ${monthNames[date.getMonth()]} ${date.getFullYear()}`;
  };

  const updateDate = (index: number, value: string) => {
    const newDates = [...dates];
    newDates[index] = value;
    setDates(newDates);
  };

  return (
    <div className="space-y-3 py-3 border-b border-border">
      <div className="flex items-center gap-3">
        <h3 className="text-xs font-semibold uppercase text-muted-foreground">
          Delivery Dates
        </h3>

        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const today = new Date();
            const newDate = new Date(
              today.setMonth(today.getMonth() + dates.length),
            );
            setDates([...dates, newDate.toISOString().split("T")[0]]);
          }}
          className="h-7 text-xs gap-1.5"
        >
          <Calendar className="w-3 h-3" />
          Add more dates
        </Button>

        <div className="flex items-center gap-2 ml-auto">
          <Checkbox
            id="detailed-all"
            checked={detailedAll}
            onCheckedChange={(checked) => setDetailedAll(checked === true)}
          />
          <label
            htmlFor="detailed-all"
            className="text-xs text-muted-foreground cursor-pointer"
          >
            Detailed all
          </label>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {dates.map((date, index) => (
          <div key={index} className="relative inline-block">
            <input
              ref={(el) => (refs.current[index] = el)}
              id={`date-${index}`}
              type="date"
              value={date}
              onChange={(e) => updateDate(index, e.target.value)}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <label
              htmlFor={`date-${index}`}
              onClick={() => refs.current[index]?.click()}
              className="px-3 py-1.5 text-xs border border-border rounded bg-muted/30 cursor-pointer flex items-center justify-between min-w-[120px]"
            >
              <span>{formatDate(date)}</span>
              <Calendar className="w-3 h-3 text-muted-foreground" />
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}
