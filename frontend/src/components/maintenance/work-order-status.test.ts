import { describe, expect, it } from "vitest";

import { workOrderItem } from "@/test/fixtures";

import { itemProgress } from "./work-order-status";

describe("itemProgress", () => {
  it("counts signed-off items and leaves cancelled ones out", () => {
    expect(
      itemProgress([
        workOrderItem({ status: "signed_off" }),
        workOrderItem({ status: "pending" }),
        workOrderItem({ status: "cancelled" }),
      ]),
    ).toBe("1 of 2 signed off");
  });
});
