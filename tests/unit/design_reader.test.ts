import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { readDesignTable } from "../../src/ingestion/design_reader.js";

describe("readDesignTable", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), "epimcp-design-test-"));
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("ingests a valid design table with default column names", () => {
    const path = join(tempDir, "valid.csv");
    writeFileSync(
      path,
      "sample_id,group_id,dose_value,dose_unit,replicate_type,batch_id,timepoint,treatment,control_flag\n" +
        "s1,ctrl,0,µM,biological,b1,24,DMSO,true\n" +
        "s2,ctrl,0,µM,biological,b1,24,DMSO,true\n" +
        "s3,low,1,µM,technical,b1,24,TCDD,false\n" +
        "s4,low,1,µM,technical,b1,24,TCDD,false\n" +
        "s5,high,10,µM,biological,b1,24,TCDD,false\n",
    );

    const result = readDesignTable(path, {
      designId: "design-001",
      species: "Homo sapiens",
    });

    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.design).toBeDefined();

    const design = result.design!;
    expect(design.designId).toBe("design-001");
    expect(design.species).toBe("Homo sapiens");
    expect(design.hasControls).toBe(true);
    expect(design.minReplicatesPerGroup).toBe(1);

    expect(design.doseGroups).toHaveLength(3);
    const ctrlGroup = design.doseGroups.find((g) => g.doseGroupId === "ctrl");
    expect(ctrlGroup).toBeDefined();
    expect(ctrlGroup!.doseValue).toBe(0);
    expect(ctrlGroup!.doseUnit).toBe("µM");
    expect(ctrlGroup!.timepointHours).toBe(24);

    expect(design.samples).toHaveLength(5);
    const s1 = design.samples.find((s) => s.sampleId === "s1");
    expect(s1).toBeDefined();
    expect(s1!.doseGroupId).toBe("ctrl");
    expect(s1!.replicateType).toBe("biological");
    expect(s1!.batchId).toBe("b1");
    expect(s1!.controlFlag).toBe(true);
    expect(s1!.treatment).toBe("DMSO");
    expect(s1!.replicateIndex).toBe(0);

    const s3 = design.samples.find((s) => s.sampleId === "s3");
    expect(s3!.replicateType).toBe("technical");
    expect(s3!.controlFlag).toBe(false);
    expect(s3!.replicateIndex).toBe(0);

    const s4 = design.samples.find((s) => s.sampleId === "s4");
    expect(s4!.replicateIndex).toBe(1);
  });

  it("ingests a TSV file with auto-detected delimiter", () => {
    const path = join(tempDir, "valid.tsv");
    writeFileSync(
      path,
      "sample_id\tgroup_id\tdose_value\tdose_unit\tcontrol_flag\n" +
        "s1\tctrl\t0\tµM\ttrue\n" +
        "s2\tlow\t1\tµM\tfalse\n",
    );

    const result = readDesignTable(path, {
      designId: "design-tsv",
      species: "Mus musculus",
    });

    expect(result.success).toBe(true);
    expect(result.design).toBeDefined();
    expect(result.design!.doseGroups).toHaveLength(2);
    expect(result.design!.samples).toHaveLength(2);
  });

  it("supports explicit column mapping", () => {
    const path = join(tempDir, "mapped.csv");
    writeFileSync(
      path,
      "Sample,Group,Dose,Unit,Rep,Batch\n" +
        "s1,ctrl,0,µM,bio,b1\n" +
        "s2,low,1,µM,tech,b1\n",
    );

    const result = readDesignTable(path, {
      designId: "design-mapped",
      species: "Homo sapiens",
      columnMapping: {
        sampleId: "Sample",
        groupId: "Group",
        doseValue: "Dose",
        doseUnit: "Unit",
        replicateType: "Rep",
        batchId: "Batch",
      },
    });

    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.design!.samples).toHaveLength(2);
    expect(result.design!.samples[0].sampleId).toBe("s1");
    expect(result.design!.samples[0].replicateType).toBe("biological");
    expect(result.design!.samples[1].replicateType).toBe("technical");
  });

  it("fails closed when sample_id is missing", () => {
    const path = join(tempDir, "missing-sample.csv");
    writeFileSync(
      path,
      "sample_id,group_id,dose_value,dose_unit\n" +
        ",ctrl,0,µM\n" +
        "s2,low,1,µM\n",
    );

    const result = readDesignTable(path, {
      designId: "design-bad",
      species: "Homo sapiens",
    });

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes("missing sample_id"))).toBe(
      true,
    );
    expect(result.design).toBeUndefined();
  });

  it("fails closed when required column is missing from file", () => {
    const path = join(tempDir, "missing-col.csv");
    writeFileSync(
      path,
      "sample_id,group_id,dose_value\n" + "s1,ctrl,0\n",
    );

    const result = readDesignTable(path, {
      designId: "design-bad",
      species: "Homo sapiens",
    });

    expect(result.success).toBe(false);
    expect(
      result.errors.some((e) => e.includes("Missing required column")),
    ).toBe(true);
  });

  it("fails closed on duplicate sample_id", () => {
    const path = join(tempDir, "dup-sample.csv");
    writeFileSync(
      path,
      "sample_id,group_id,dose_value,dose_unit\n" +
        "s1,ctrl,0,µM\n" +
        "s1,low,1,µM\n" +
        "s2,high,10,µM\n",
    );

    const result = readDesignTable(path, {
      designId: "design-dup",
      species: "Homo sapiens",
    });

    expect(result.success).toBe(false);
    expect(
      result.errors.some((e) => e.includes("duplicate sample_id")),
    ).toBe(true);
    // Only the first occurrence should be included in the parsed design
    if (result.design) {
      const sampleIds = result.design.samples.map((s) => s.sampleId);
      expect(sampleIds).toContain("s1");
      expect(sampleIds).toContain("s2");
      expect(sampleIds).toHaveLength(2);
    }
  });

  it("fails closed on invalid replicate_type", () => {
    const path = join(tempDir, "bad-rep.csv");
    writeFileSync(
      path,
      "sample_id,group_id,dose_value,dose_unit,replicate_type\n" +
        "s1,ctrl,0,µM,invalid_type\n",
    );

    const result = readDesignTable(path, {
      designId: "design-rep",
      species: "Homo sapiens",
    });

    expect(result.success).toBe(false);
    expect(
      result.errors.some((e) => e.includes("invalid replicate_type")),
    ).toBe(true);
  });

  it("fails closed when dose_unit is missing", () => {
    const path = join(tempDir, "missing-unit.csv");
    writeFileSync(
      path,
      "sample_id,group_id,dose_value,dose_unit\n" +
        "s1,ctrl,0,\n" +
        "s2,low,1,µM\n",
    );

    const result = readDesignTable(path, {
      designId: "design-unit",
      species: "Homo sapiens",
    });

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes("missing dose_unit"))).toBe(
      true,
    );
  });

  it("fails closed on invalid dose_value", () => {
    const path = join(tempDir, "bad-dose.csv");
    writeFileSync(
      path,
      "sample_id,group_id,dose_value,dose_unit\n" +
        "s1,ctrl,not_a_number,µM\n",
    );

    const result = readDesignTable(path, {
      designId: "design-dose",
      species: "Homo sapiens",
    });

    expect(result.success).toBe(false);
    expect(
      result.errors.some((e) => e.includes("invalid or missing dose_value")),
    ).toBe(true);
  });

  it("fails closed on invalid control_flag", () => {
    const path = join(tempDir, "bad-flag.csv");
    writeFileSync(
      path,
      "sample_id,group_id,dose_value,dose_unit,control_flag\n" +
        "s1,ctrl,0,µM,maybe\n",
    );

    const result = readDesignTable(path, {
      designId: "design-flag",
      species: "Homo sapiens",
    });

    expect(result.success).toBe(false);
    expect(
      result.errors.some((e) => e.includes("invalid control_flag")),
    ).toBe(true);
  });

  it("parses control_flag variants correctly", () => {
    const path = join(tempDir, "flags.csv");
    writeFileSync(
      path,
      "sample_id,group_id,dose_value,dose_unit,control_flag\n" +
        "s1,ctrl,0,µM,true\n" +
        "s2,ctrl,0,µM,yes\n" +
        "s3,ctrl,0,µM,1\n" +
        "s4,ctrl,0,µM,control\n" +
        "s5,ctrl,0,µM,ctrl\n" +
        "s6,low,1,µM,false\n" +
        "s7,low,1,µM,no\n" +
        "s8,low,1,µM,0\n" +
        "s9,low,1,µM,treatment\n" +
        "s10,low,1,µM,\n",
    );

    const result = readDesignTable(path, {
      designId: "design-flags",
      species: "Homo sapiens",
    });

    expect(result.success).toBe(true);
    const trueSamples = result
      .design!.samples.filter((s) => s.controlFlag)
      .map((s) => s.sampleId);
    const falseSamples = result
      .design!.samples.filter((s) => !s.controlFlag)
      .map((s) => s.sampleId);

    expect(trueSamples).toEqual(["s1", "s2", "s3", "s4", "s5"]);
    expect(falseSamples).toEqual(["s6", "s7", "s8", "s9", "s10"]);
  });

  it("derives hasControls from zero-dose group when no explicit control flags", () => {
    const path = join(tempDir, "zero-dose.csv");
    writeFileSync(
      path,
      "sample_id,group_id,dose_value,dose_unit\n" +
        "s1,ctrl,0,µM\n" +
        "s2,low,1,µM\n",
    );

    const result = readDesignTable(path, {
      designId: "design-zero",
      species: "Homo sapiens",
    });

    expect(result.success).toBe(true);
    expect(result.design!.hasControls).toBe(true);
  });

  it("computes minReplicatesPerGroup correctly", () => {
    const path = join(tempDir, "replicates.csv");
    writeFileSync(
      path,
      "sample_id,group_id,dose_value,dose_unit\n" +
        "s1,ctrl,0,µM\n" +
        "s2,ctrl,0,µM\n" +
        "s3,ctrl,0,µM\n" +
        "s4,low,1,µM\n" +
        "s5,low,1,µM\n",
    );

    const result = readDesignTable(path, {
      designId: "design-rep",
      species: "Homo sapiens",
    });

    expect(result.success).toBe(true);
    expect(result.design!.minReplicatesPerGroup).toBe(2);
  });

  it("fails closed on empty data file", () => {
    const path = join(tempDir, "empty.csv");
    writeFileSync(path, "sample_id,group_id,dose_value,dose_unit\n");

    const result = readDesignTable(path, {
      designId: "design-empty",
      species: "Homo sapiens",
    });

    expect(result.success).toBe(false);
    expect(
      result.errors.some((e) => e.includes("no data rows")),
    ).toBe(true);
  });

  it("fails closed on invalid options", () => {
    const path = join(tempDir, "any.csv");
    writeFileSync(path, "sample_id,group_id,dose_value,dose_unit\n");

    const result = readDesignTable(path, {
      // @ts-expect-error testing invalid option
      designId: "",
      species: "Homo sapiens",
    });

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes("options.designId"))).toBe(
      true,
    );
  });

  it("allows optional columns to be absent", () => {
    const path = join(tempDir, "minimal.csv");
    writeFileSync(
      path,
      "sample_id,group_id,dose_value,dose_unit\n" +
        "s1,ctrl,0,µM\n" +
        "s2,low,1,µM\n",
    );

    const result = readDesignTable(path, {
      designId: "design-min",
      species: "Homo sapiens",
    });

    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.design!.samples[0].replicateType).toBeUndefined();
    expect(result.design!.samples[0].batchId).toBeUndefined();
    expect(result.design!.samples[0].treatment).toBeUndefined();
  });
});
