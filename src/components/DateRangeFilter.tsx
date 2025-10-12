"use client";

import * as React from "react";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, subWeeks, subMonths, subYears } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { DateRange } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface DateRangeFilterProps extends React.HTMLAttributes<HTMLDivElement> {
  onDateRangeChange: (range: { from: Date | undefined; to: Date | undefined; label: string }) => void;
  initialRange?: { from: Date | undefined; to: Date | undefined; label: string };
}

export function DateRangeFilter({
  className,
  onDateRangeChange,
  initialRange,
}: DateRangeFilterProps) {
  const today = new Date();
  const [date, setDate] = React.useState<DateRange | undefined>(initialRange?.from && initialRange?.to ? { from: initialRange.from, to: initialRange.to } : undefined);
  const [selectedInterval, setSelectedInterval] = React.useState<string>(initialRange?.label || "custom");

  // Effect to call onDateRangeChange when 'date' or 'selectedInterval' changes
  React.useEffect(() => {
    onDateRangeChange({ from: date?.from, to: date?.to, label: selectedInterval });
  }, [date, selectedInterval, onDateRangeChange]);

  const handleSelectInterval = (value: string) => {
    setSelectedInterval(value);
    let newFrom: Date | undefined;
    let newTo: Date | undefined;

    switch (value) {
      case "today":
        newFrom = today;
        newTo = today;
        break;
      case "this_week":
        newFrom = startOfWeek(today, { weekStartsOn: 1 });
        newTo = endOfWeek(today, { weekStartsOn: 1 });
        break;
      case "this_month":
        newFrom = startOfMonth(today);
        newTo = endOfMonth(today);
        break;
      case "this_year":
        newFrom = startOfYear(today);
        newTo = endOfYear(today);
        break;
      case "last_week":
        newFrom = startOfWeek(subWeeks(today, 1), { weekStartsOn: 1 });
        newTo = endOfWeek(subWeeks(today, 1), { weekStartsOn: 1 });
        break;
      case "last_month":
        newFrom = startOfMonth(subMonths(today, 1));
        newTo = endOfMonth(subMonths(today, 1));
        break;
      case "last_year":
        newFrom = startOfYear(subYears(today, 1));
        newTo = endOfYear(subYears(today, 1));
        break;
      case "custom":
        // Keep current date range or set a default for custom if none selected
        break;
      default:
        newFrom = undefined;
        newTo = undefined;
        break;
    }
    setDate({ from: newFrom, to: newTo });
  };

  return (
    <div className={cn("grid gap-2", className)}>
      <Select onValueChange={handleSelectInterval} value={selectedInterval}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Filter by date" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="today">Today</SelectItem>
          <SelectItem value="this_week">This Week</SelectItem>
          <SelectItem value="this_month">This Month</SelectItem>
          <SelectItem value="this_year">This Year</SelectItem>
          <SelectItem value="last_week">Last Week</SelectItem>
          <SelectItem value="last_month">Last Month</SelectItem>
          <SelectItem value="last_year">Last Year</SelectItem>
          <SelectItem value="custom">Custom Range</SelectItem>
        </SelectContent>
      </Select>

      {selectedInterval === "custom" && (
        <div className="flex flex-col gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                id="date"
                variant={"outline"}
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !date?.from && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {date?.from ? (
                  date.to ? (
                    <>
                      {format(date.from, "LLL dd, y")} -{" "}
                      {format(date.to, "LLL dd, y")}
                    </>
                  ) : (
                    format(date.from, "LLL dd, y")
                  )
                ) : (
                  <span>Pick a date</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 min-h-[280px]" align="start">
              <Calendar
                initialFocus
                mode="range"
                defaultMonth={date?.from}
                selected={date}
                onSelect={(newDateRange) => {
                  setDate(newDateRange);
                }}
                numberOfMonths={2}
                fixedWeeks={true}
              />
            </PopoverContent>
          </Popover>
        </div>
      )}
    </div>
  );
}