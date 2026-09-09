import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker } from "react-day-picker"
import {
  format,
  setMonth,
  setYear,
  addYears,
  subYears,
  startOfMonth,
} from "date-fns"

import { cn } from "lib/utils"
import { Button, buttonVariants } from "components/ui/button"

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  fromYear = 1950,
  toYear = new Date().getFullYear() + 15,
  month: controlledMonth,
  onMonthChange,
  selected,
  defaultMonth,
  ...props
}) {
  const initialMonth = startOfMonth(
    controlledMonth ||
      (selected instanceof Date ? selected : null) ||
      defaultMonth ||
      new Date()
  )
  const [internalMonth, setInternalMonth] = React.useState(initialMonth)
  const [view, setView] = React.useState("days") // days | months | years

  const month = controlledMonth ? startOfMonth(controlledMonth) : internalMonth

  const setMonthSafe = (next) => {
    const clamped = startOfMonth(next)
    if (!controlledMonth) setInternalMonth(clamped)
    onMonthChange?.(clamped)
  }

  React.useEffect(() => {
    if (controlledMonth) setInternalMonth(startOfMonth(controlledMonth))
  }, [controlledMonth])

  React.useEffect(() => {
    // Reset picker panel when selection changes / popover remounts
    setView("days")
  }, [selected])

  const year = month.getFullYear()
  const decadeStart = Math.floor(year / 12) * 12

  const goPrev = () => {
    if (view === "years") setMonthSafe(subYears(month, 12))
    else if (view === "months") setMonthSafe(subYears(month, 1))
    else setMonthSafe(new Date(year, month.getMonth() - 1, 1))
  }

  const goNext = () => {
    if (view === "years") setMonthSafe(addYears(month, 12))
    else if (view === "months") setMonthSafe(addYears(month, 1))
    else setMonthSafe(new Date(year, month.getMonth() + 1, 1))
  }

  const canPrev = (() => {
    if (view === "years") return decadeStart > fromYear
    if (view === "months") return year > fromYear
    return year > fromYear || month.getMonth() > 0
  })()

  const canNext = (() => {
    if (view === "years") return decadeStart + 11 < toYear
    if (view === "months") return year < toYear
    return year < toYear || month.getMonth() < 11
  })()

  return (
    <div className={cn("w-[280px] p-3", className)}>
      <div className="relative mb-3 flex items-center justify-center gap-1 px-8">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="absolute left-0 h-7 w-7"
          onClick={goPrev}
          disabled={!canPrev}
          aria-label="Previous"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <div className="flex items-center gap-1">
          <button
            type="button"
            className={cn(
              "h-8 rounded-md border border-input bg-background px-2 text-sm font-medium hover:bg-accent",
              view === "months" && "border-primary bg-primary/10 text-primary"
            )}
            onClick={() => setView((v) => (v === "months" ? "days" : "months"))}
          >
            {format(month, "MMMM")}
          </button>
          <button
            type="button"
            className={cn(
              "h-8 rounded-md border border-input bg-background px-2 text-sm font-medium hover:bg-accent",
              view === "years" && "border-primary bg-primary/10 text-primary"
            )}
            onClick={() => setView((v) => (v === "years" ? "days" : "years"))}
          >
            {format(month, "yyyy")}
          </button>
        </div>

        <Button
          type="button"
          variant="outline"
          size="icon"
          className="absolute right-0 h-7 w-7"
          onClick={goNext}
          disabled={!canNext}
          aria-label="Next"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {view === "months" && (
        <div className="grid grid-cols-3 gap-2 py-1">
          {MONTHS.map((label, index) => {
            const active = month.getMonth() === index
            return (
              <button
                key={label}
                type="button"
                className={cn(
                  "h-9 rounded-md text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-accent text-foreground"
                )}
                onClick={() => {
                  setMonthSafe(setMonth(month, index))
                  setView("days")
                }}
              >
                {label}
              </button>
            )
          })}
        </div>
      )}

      {view === "years" && (
        <div className="grid grid-cols-3 gap-2 py-1 max-h-[220px] overflow-y-auto">
          {Array.from({ length: 12 }, (_, i) => decadeStart + i)
            .filter((y) => y >= fromYear && y <= toYear)
            .map((y) => {
              const active = year === y
              return (
                <button
                  key={y}
                  type="button"
                  className={cn(
                    "h-9 rounded-md text-sm font-medium transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-accent text-foreground"
                  )}
                  onClick={() => {
                    setMonthSafe(setYear(month, y))
                    setView("months")
                  }}
                >
                  {y}
                </button>
              )
            })}
        </div>
      )}

      {view === "days" && (
        <DayPicker
          showOutsideDays={showOutsideDays}
          month={month}
          onMonthChange={setMonthSafe}
          selected={selected}
          classNames={{
            months: "flex flex-col",
            month: "space-y-3",
            caption: "hidden",
            nav: "hidden",
            table: "w-full border-collapse",
            head_row: "flex",
            head_cell:
              "text-muted-foreground rounded-md w-8 font-normal text-[0.8rem]",
            row: "flex w-full mt-2",
            cell: cn(
              "relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-accent [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected].day-range-end)]:rounded-r-md",
              props.mode === "range"
                ? "[&:has(>.day-range-end)]:rounded-r-md [&:has(>.day-range-start)]:rounded-l-md first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md"
                : "[&:has([aria-selected])]:rounded-md"
            ),
            day: cn(
              buttonVariants({ variant: "ghost" }),
              "h-8 w-8 p-0 font-normal aria-selected:opacity-100"
            ),
            day_range_start: "day-range-start",
            day_range_end: "day-range-end",
            day_selected:
              "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
            day_today: "bg-accent text-accent-foreground",
            day_outside:
              "day-outside text-muted-foreground aria-selected:bg-accent/50 aria-selected:text-muted-foreground",
            day_disabled: "text-muted-foreground opacity-50",
            day_range_middle:
              "aria-selected:bg-accent aria-selected:text-accent-foreground",
            day_hidden: "invisible",
            ...classNames,
          }}
          components={{
            IconLeft: ({ className, ...iconProps }) => (
              <ChevronLeft className={cn("h-4 w-4", className)} {...iconProps} />
            ),
            IconRight: ({ className, ...iconProps }) => (
              <ChevronRight className={cn("h-4 w-4", className)} {...iconProps} />
            ),
          }}
          {...props}
        />
      )}
    </div>
  )
}
Calendar.displayName = "Calendar"

export { Calendar }
