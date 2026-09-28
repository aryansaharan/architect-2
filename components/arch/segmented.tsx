"use client";
import { PencilRadio } from "@/components/workspace/sheet/pencil-radio";

export type SegmentOption<T extends string> = { value: T; label: React.ReactNode; title?: string };

/** The one segmented control: the pencil tabs used on the Sheet (one tab stop, arrow keys move). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = "sm",
  className,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: SegmentOption<T>[];
  size?: "xs" | "sm";
  className?: string;
  ariaLabel: string;
}) {
  return <PencilRadio value={value} onChange={onChange} options={options} label={ariaLabel} size={size} className={className} />;
}
