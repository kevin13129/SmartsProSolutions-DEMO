import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Script, createContext } from 'node:vm';

const context = createContext({ window: {} });
new Script(await readFile(new URL('../assets/js/estimate-model.js', import.meta.url), 'utf8')).runInContext(context);
const model = context.window.SmartsProEstimate;
const residential = () => ({ ...model.initialState(), serviceType: 'residential', cleaningLevel: 'standard', condition: 'routine', pets: 'none', frequency: 'biweekly' });

test('service and frequency are explicit choices; incomplete scope has no price', () => {
  const state = model.initialState();
  assert.equal(state.serviceType, '');
  assert.equal(state.frequency, '');
  assert.equal(model.calculate(state).grandTotal, null);
  const scope = residential();
  for (const key of ['serviceType', 'frequency', 'cleaningLevel', 'condition', 'pets']) {
    assert.equal(model.calculate({ ...scope, [key]: '' }).grandTotal, null, key);
  }
  assert.equal(model.calculate({ ...scope, frequency: 'turnover' }).grandTotal, null);
});

test('residential line items reconcile, including rounding, minimum and every extra', () => {
  const state = residential();
  assert.equal(model.calculate(state).grandTotal, 153);
  assert.equal(model.calculate(state).hourlyRate, 40);
  assert.equal(model.calculate(state).estimatedHours, 4.5);
  state.addons = { fridgeSingle: 2, fridgeDouble: 1, oven: 1, petDetail: 1 };
  let quote = model.calculate(state);
  assert.equal(quote.items.length, 4);
  assert.equal(quote.addonsTotal, 320);
  assert.equal(quote.grandTotal, 473);
  const summary = model.describe(state);
  for (const text of ['2 × Single refrigerator', '$130.00', '$473.00', 'No pets', '4.50 hours']) assert.ok(summary.text.includes(text), text);
  assert.ok(!summary.text.includes('$40.00/hour'), 'Hourly crew rate is omitted from summary text');
  Object.assign(state, { bedrooms: 0, fullBaths: 1, halfBaths: 0, sqft: 400, frequency: 'weekly', addons: {} });
  quote = model.calculate(state);
  assert.equal(quote.grandTotal, 110);
  assert.equal(quote.minimumAdjustment, 46);
  Object.assign(state, { bedrooms: 3, fullBaths: 2, halfBaths: 1, sqft: 1801, cleaningLevel: 'deep' });
  quote = model.calculate(state);
  assert.equal(quote.hourlyRate, 50);
  assert.equal(Math.round((quote.serviceSubtotal - quote.discountAmount + quote.minimumAdjustment + quote.addonsTotal) * 100), Math.round(quote.grandTotal * 100));
});

test('hourly rates reflect the cleaning level and size while extras stay fixed', () => {
  const base = { ...residential(), frequency: 'onetime' };
  const standard = model.calculate(base);
  const deep = model.calculate({ ...base, cleaningLevel: 'deep' });
  const move = model.calculate({ ...base, cleaningLevel: 'moveinout' });
  assert.equal(standard.grandTotal, 180);
  assert.equal(deep.estimatedHours, 6.5);
  assert.equal(deep.grandTotal, 325);
  assert.equal(move.hourlyRate, 50);
  assert.equal(move.grandTotal, 387.5);
  assert.ok(model.calculate({ ...base, sqft: 2400 }).estimatedHours > standard.estimatedHours);
  assert.ok(model.calculate({ ...base, fullBaths: 3 }).estimatedHours > standard.estimatedHours);
  for (const cleaningLevel of ['standard', 'deep', 'moveinout']) {
    const plain = model.calculate({ ...base, cleaningLevel });
    const extra = model.calculate({ ...base, cleaningLevel, addons: { fridgeSingle: 1, fridgeDouble: 1, oven: 1, petDetail: 1 } });
    assert.equal(extra.grandTotal - plain.grandTotal, 255);
    assert.equal(extra.estimatedHours, plain.estimatedHours);
  }
});

test('condition requires assessment without inventing unapproved surcharges', () => {
  for (const condition of ['buildup', 'heavy']) {
    const state = { ...residential(), condition };
    assert.equal(model.calculate(state).grandTotal, null);
    assert.equal(model.describe(state).price, 'Assessment needed');
  }
});

test('commercial and Airbnb never reuse residential prices or discounts', () => {
  const commercial = { ...residential(), serviceType: 'commercial', buildingUse: 'office', floors: ['tile', 'carpet'], walkthrough: 'morning', addons: { fridgeSingle: 1, interiorGlass: 1 } };
  const rental = { ...residential(), serviceType: 'airbnb', frequency: 'turnover', beds: 4, laundry: 'onsite', restocking: 'supplied', checkout: '11:00', checkin: '15:00', addons: { fridgeSingle: 1, dishes: 1 } };
  for (const state of [commercial, rental]) {
    const quote = model.calculate(state);
    assert.equal(quote.grandTotal, null);
    assert.equal(quote.discountAmount, 0);
    assert.equal(quote.missing.length, 0);
    assert.equal(quote.items.length, 1);
    assert.equal(quote.items[0].total, null);
    assert.ok(model.describe(state).text.includes('Price after assessment'));
    const selection = model.selection(state);
    assert.equal(selection.requirements.pets, undefined);
    assert.equal(selection.requirements.cleaningLevel, undefined);
    assert.equal(selection.grandTotal, undefined);
  }
  const commercialSelection = model.selection(commercial);
  assert.equal(commercialSelection.property.bedrooms, undefined);
  commercialSelection.requirements.floors.push('wood');
  assert.equal(commercial.floors.length, 2, 'Selection must be an independent snapshot');
  assert.equal(model.selection(rental).requirements.checkin, '15:00');
  assert.equal(model.selection(rental).requirements.beds, 4);
});

test('monthly wording and unsupported advertising claims do not regress', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.equal(model.frequencies.monthly, 'Monthly');
  assert.doesNotMatch(html, /every 4|4 wks|background.checked|non.toxic|pet.friendly|eco.friendly|healthier|inspection.ready|founded in|industrial|HEPA|insured|bonded|screened|guaranteed|disinfect|sanitiz/i);
  assert.doesNotMatch(html, /type="radio"[^>]*\bchecked\b/);
  assert.doesNotMatch(html, /<select\b|<option\b/);
  assert.doesNotMatch(html, /logo-transparent\.png|logo-mark\.png/);
  const manifest = JSON.parse(await readFile(new URL('../security/public-files.json', import.meta.url), 'utf8'));
  assert.ok(manifest.includes('assets/js/estimate-model.js'));
  assert.ok(!manifest.some(file => /(?:business-card|services-card|logo-.*\.png)/.test(file)));
  const icon = await readFile(new URL('../assets/images/brand-mark.svg', import.meta.url), 'utf8');
  assert.doesNotMatch(icon, /<script|<foreignObject|<image|<style|\son\w+\s*=|(?:href|style)\s*=|<!ENTITY|<!DOCTYPE/i);
  assert.ok([...icon.matchAll(/<\/?([\w:-]+)/g)].every(([, tag]) => ['svg', 'rect', 'path'].includes(tag)));
});
