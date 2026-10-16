import { StatTile, type StatTone } from "../../components/StatTile";

/** A headline number with its label and an optional line under it (the shared StatTile). */
export function Tile({
  title,
  sub,
  ...rest
}: {
  title: string;
  value: string;
  sub?: string;
  tone?: StatTone;
  delta?: { now: number; prev: number; label?: string; lowerIsBetter?: boolean };
}) {
  return <StatTile label={title} hint={sub} {...rest} />;
}
