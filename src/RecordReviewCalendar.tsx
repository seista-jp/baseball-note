import { useEffect, useMemo, useRef, useState } from "react";
import {
  formatJapaneseDate,
  formatMonthLabel,
  getCalendarMonthDates,
  getMonthStart,
  offsetMonthKey,
} from "./date";

export type DateRange = {
  start: string;
  end: string;
};

type RecordReviewCalendarProps = {
  currentRange: DateRange | null;
  maxDate: string;
  onApply: (range: DateRange) => void;
  onCancel: () => void;
};

const dayNames = ["日", "月", "火", "水", "木", "金", "土"];

export function RecordReviewCalendar({
  currentRange,
  maxDate,
  onApply,
  onCancel,
}: RecordReviewCalendarProps) {
  const [rangeStart, setRangeStart] = useState(currentRange?.start ?? "");
  const [rangeEnd, setRangeEnd] = useState(currentRange?.end ?? "");
  const [visibleMonth, setVisibleMonth] = useState(
    getMonthStart(currentRange?.start ?? maxDate),
  );
  const dialogTitleRef = useRef<HTMLHeadingElement>(null);
  const calendarDates = useMemo(
    () => getCalendarMonthDates(visibleMonth),
    [visibleMonth],
  );
  const maxMonth = getMonthStart(maxDate);
  const hasCompleteRange = Boolean(rangeStart && rangeEnd);

  useEffect(() => {
    dialogTitleRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCancel();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  function selectDate(dateKey: string) {
    if (dateKey > maxDate) {
      return;
    }

    if (!rangeStart || rangeEnd) {
      setRangeStart(dateKey);
      setRangeEnd("");
      return;
    }

    if (dateKey < rangeStart) {
      setRangeStart(dateKey);
      return;
    }

    setRangeEnd(dateKey);
  }

  const selectionMessage = !rangeStart
    ? "開始日を選んでください"
    : !rangeEnd
      ? `${formatJapaneseDate(rangeStart)}からの終了日を選んでください`
      : `${formatJapaneseDate(rangeStart)} 〜 ${formatJapaneseDate(rangeEnd)}を選択中`;

  return (
    <div className="range-dialog-backdrop">
      <section
        className="range-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="range-dialog-title"
        aria-describedby="range-selection-status"
      >
        <header className="range-dialog-header">
          <div>
            <p className="range-dialog-eyebrow">表示する期間</p>
            <h2 id="range-dialog-title" ref={dialogTitleRef} tabIndex={-1}>
              期間を選ぶ
            </h2>
          </div>
          <button className="range-dialog-close" type="button" onClick={onCancel} aria-label="期間選択を閉じる">
            閉じる
          </button>
        </header>

        <div className="range-selection-summary" aria-live="polite">
          <div>
            <span>開始日</span>
            <strong>{rangeStart ? formatJapaneseDate(rangeStart) : "未選択"}</strong>
          </div>
          <span className="range-selection-separator" aria-hidden="true">
            〜
          </span>
          <div>
            <span>終了日</span>
            <strong>{rangeEnd ? formatJapaneseDate(rangeEnd) : "未選択"}</strong>
          </div>
        </div>
        <p
          className={rangeStart && !rangeEnd ? "range-selection-status selecting" : "range-selection-status"}
          id="range-selection-status"
        >
          {selectionMessage}
        </p>

        <div className="calendar-month-header">
          <button
            type="button"
            onClick={() => setVisibleMonth((month) => offsetMonthKey(month, -1))}
            aria-label="前の月を表示"
          >
            ＜
          </button>
          <strong aria-live="polite">{formatMonthLabel(visibleMonth)}</strong>
          <button
            type="button"
            onClick={() => setVisibleMonth((month) => offsetMonthKey(month, 1))}
            aria-label="次の月を表示"
            disabled={visibleMonth >= maxMonth}
          >
            ＞
          </button>
        </div>

        <div className="calendar-weekdays" aria-hidden="true">
          {dayNames.map((dayName) => (
            <span key={dayName}>{dayName}</span>
          ))}
        </div>
        <div className="calendar-grid" aria-label={`${formatMonthLabel(visibleMonth)}の日付`}>
          {calendarDates.map((dateKey, index) => {
            if (!dateKey) {
              return <span className="calendar-day-empty" key={`empty-${index}`} />;
            }

            const isFuture = dateKey > maxDate;
            const isRangeStart = dateKey === rangeStart;
            const isRangeEnd = dateKey === rangeEnd;
            const isInCompleteRange = Boolean(
              rangeStart && rangeEnd && dateKey >= rangeStart && dateKey <= rangeEnd,
            );
            const classNames = [
              "calendar-day",
              isInCompleteRange ? "in-range" : "",
              isRangeStart ? "range-start" : "",
              isRangeEnd ? "range-end" : "",
              dateKey === maxDate ? "today" : "",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <button
                className={classNames}
                type="button"
                key={dateKey}
                onClick={() => selectDate(dateKey)}
                disabled={isFuture}
                aria-label={`${formatJapaneseDate(dateKey)}${dateKey === maxDate ? "、今日" : ""}`}
                aria-pressed={isRangeStart || isRangeEnd}
              >
                <span>{Number(dateKey.slice(-2))}</span>
              </button>
            );
          })}
        </div>

        <footer className="range-dialog-actions">
          <button className="range-cancel-button" type="button" onClick={onCancel}>
            キャンセル
          </button>
          <button
            className="range-apply-button"
            type="button"
            disabled={!hasCompleteRange}
            onClick={() => {
              if (rangeStart && rangeEnd) {
                onApply({ start: rangeStart, end: rangeEnd });
              }
            }}
          >
            この期間を表示
          </button>
        </footer>
      </section>
    </div>
  );
}
