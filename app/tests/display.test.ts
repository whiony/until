import { test, expect } from "vitest";
import { displayDate } from "../lib/until/domain";
test("calendar display is padded English and rejects invalid dates without timezone conversion", () => {
  expect(displayDate("2026-09-26")).toBe("26 Sep 2026");
  expect(displayDate("2027-01-01")).toBe("01 Jan 2027");
  expect(displayDate("2024-02-29")).toBe("29 Feb 2024");
  for (const date of ["", "2026-02-29", "2026-13-01"])
    expect(displayDate(date)).toBe("");
});
