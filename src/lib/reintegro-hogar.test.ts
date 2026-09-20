import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  countHogarReintegroMatches,
  looksLikeHogarReintegroPayee,
  looksLikeBareHogarReintegroPayee,
  isHogarReintegroDescription,
  isConsumosHiddenPayment,
  isReintegroHogarTipo,
  sameHogarReintegroKey,
} from "./reintegro-hogar";

describe("looksLikeHogarReintegroPayee", () => {
  it("matches Retiro/Pago a Katherine Fernanda…", () => {
    assert.equal(
      looksLikeHogarReintegroPayee(
        "Retiro a Katherine Fernanda Sanchez Carrasco",
      ),
      true,
    );
    assert.equal(
      looksLikeHogarReintegroPayee("PAGO A KATHERINE FERNANDA"),
      true,
    );
    assert.equal(
      looksLikeHogarReintegroPayee("Transferencia a Katho"),
      true,
    );
  });

  it("ignores unrelated people and non-outbound lines", () => {
    assert.equal(
      looksLikeHogarReintegroPayee("Retiro a Elena Paco Coro"),
      false,
    );
    assert.equal(
      looksLikeHogarReintegroPayee("PAGO A DIA"),
      false,
    );
    assert.equal(
      looksLikeHogarReintegroPayee("Katherine Fernanda en el super"),
      false,
    );
    // First name alone is too weak (false positives).
    assert.equal(
      looksLikeHogarReintegroPayee("Retiro a Katherine"),
      false,
    );
  });
});

describe("countHogarReintegroMatches", () => {
  it("counts same description and respects onlyUnset", () => {
    const rows = [
      {
        id: "1",
        descriptionNormalized: "Retiro a Katherine Fernanda Sanchez Carrasco",
        isPayment: false,
      },
      {
        id: "2",
        descriptionNormalized: "Retiro a Katherine Fernanda Sanchez Carrasco",
        isPayment: true,
      },
      {
        id: "3",
        descriptionNormalized: "Retiro a Elena Paco Coro",
        isPayment: false,
      },
    ];
    assert.equal(
      countHogarReintegroMatches(
        rows,
        "Retiro a Katherine Fernanda Sanchez Carrasco",
      ),
      2,
    );
    assert.equal(
      countHogarReintegroMatches(
        rows,
        "Retiro a Katherine Fernanda Sanchez Carrasco",
        { onlyUnset: true },
      ),
      1,
    );
    assert.equal(
      sameHogarReintegroKey(
        "Retiro a Katherine Fernanda Sanchez Carrasco",
        "retiro a katherine fernanda sanchez carrasco",
      ),
      true,
    );
  });
});

describe("looksLikeBareHogarReintegroPayee / isHogarReintegroDescription", () => {
  it("matches bare Fiwind CSV payee (Katherine Fernanda…)", () => {
    assert.equal(
      looksLikeBareHogarReintegroPayee(
        "Katherine Fernanda Sanchez Carrasco",
      ),
      true,
    );
    assert.equal(
      isHogarReintegroDescription("Katherine Fernanda Sanchez Carrasco"),
      true,
    );
    assert.equal(looksLikeBareHogarReintegroPayee("Katho"), true);
  });

  it("does not treat merchant lines as bare reintegro", () => {
    assert.equal(
      looksLikeBareHogarReintegroPayee("Katherine Fernanda en el super"),
      false,
    );
    assert.equal(
      isHogarReintegroDescription("Katherine Fernanda en el super"),
      false,
    );
  });
});

describe("Consumos visibility for hogar reintegro isPayment", () => {
  it("keeps Katherine visible; hides unrelated payments", () => {
    assert.equal(
      isConsumosHiddenPayment(true, "Katherine Fernanda Sanchez Carrasco"),
      false,
    );
    assert.equal(
      isReintegroHogarTipo(true, "Katherine Fernanda Sanchez Carrasco"),
      true,
    );
    assert.equal(isConsumosHiddenPayment(true, "SU PAGO EN PESOS"), true);
    assert.equal(isConsumosHiddenPayment(false, "DIA"), false);
  });

  it("Rainman: Transferencia interna visible by description even without category", () => {
    assert.equal(
      isConsumosHiddenPayment(true, "CR TBE INM COE", null),
      false,
    );
    assert.equal(
      isConsumosHiddenPayment(true, "CR TRF INM COE", undefined),
      false,
    );
    assert.equal(
      isConsumosHiddenPayment(true, "A una cuenta tuya", null),
      false,
    );
    assert.equal(
      isConsumosHiddenPayment(true, "BBVA CA$ TRANSFERENCIA", null),
      false,
    );
    // Still hidden when category is plain pagos
    assert.equal(
      isConsumosHiddenPayment(true, "SU PAGO EN PESOS", "pagos"),
      true,
    );
  });
});
