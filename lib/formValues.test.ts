import { describe, expect, it } from "vitest";
import { formValues } from "./formValues";

describe("formValues", () => {
  it("keeps only the listed string fields", () => {
    const data = new FormData();
    data.set("name", "Ana");
    data.set("extra", "x");
    data.set("file", new File(["a"], "a.txt"));
    expect(formValues(data, ["name", "file", "missing"])).toEqual({ name: "Ana" });
  });
});
