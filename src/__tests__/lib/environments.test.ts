import { ENVIRONMENTS, findEnvironmentById } from "@/lib/environments";

describe("environments", () => {
  it("ships at least one curated env with each id", () => {
    const ids = ENVIRONMENTS.map((e) => e.id);
    expect(ids).toEqual(
      expect.arrayContaining(["prod", "alpha", "dev", "local"]),
    );
  });

  it("findEnvironmentById matches", () => {
    expect(findEnvironmentById("alpha")?.domain).toBe(
      "alpha.companionintel.com",
    );
  });

  it("findEnvironmentById returns undefined for unknown / null", () => {
    expect(findEnvironmentById("nope")).toBeUndefined();
    expect(findEnvironmentById(null)).toBeUndefined();
  });
});
