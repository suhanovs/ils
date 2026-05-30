/**
 * ConfigPanel — all simulation parameters, grouped by concept.
 * Each section maps to one engine module. Props pass the config down;
 * onChange propagates individual field changes up to App state.
 */

import { useState } from 'react'
import type { SimConfig } from '../engine/config'

interface Props {
  config:   SimConfig
  onChange: (patch: Partial<SimConfig>) => void
  disabled: boolean
}

// ── Generic input components ───────────────────────────────────────────────

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <label className="label flex-1 min-w-0">{label}</label>
      <div className="flex-shrink-0 w-28">{children}</div>
    </div>
  )
}

function NumInput({ value, onChange, min, max, step = 'any', disabled }:
  { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: string | number; disabled?: boolean }) {
  return (
    <input type="number" className="input" value={value} disabled={disabled}
      min={min} max={max} step={step}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)} />
  )
}

function SelectInput<T extends string>({ value, options, onChange, disabled }:
  { value: T; options: { val: T; label: string }[]; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <select className="select" value={value} disabled={disabled}
      onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => <option key={o.val} value={o.val}>{o.label}</option>)}
    </select>
  )
}

function CheckInput({ value, onChange, disabled }:
  { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <input type="checkbox" className="w-4 h-4 accent-blue-500" checked={value} disabled={disabled}
      onChange={(e) => onChange(e.target.checked)} />
  )
}

// ── Section wrapper ────────────────────────────────────────────────────────

function Section({ title, color = 'blue', children }: { title: string; color?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true)
  const accent: Record<string, string> = {
    blue:   'text-blue-400 border-blue-800',
    amber:  'text-amber-400 border-amber-800',
    purple: 'text-purple-400 border-purple-800',
    emerald:'text-emerald-400 border-emerald-800',
    rose:   'text-rose-400 border-rose-800',
    slate:  'text-slate-400 border-slate-700',
  }
  return (
    <div className={`border-b ${accent[color]?.split(' ')[1] ?? 'border-slate-700'} last:border-0`}>
      <button
        className={`w-full text-left py-2 px-1 label flex justify-between ${accent[color]?.split(' ')[0] ?? 'text-slate-400'}`}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="uppercase tracking-widest text-xs">{title}</span>
        <span>{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="px-1 pb-3 space-y-0.5">{children}</div>}
    </div>
  )
}

// ── Main ConfigPanel ───────────────────────────────────────────────────────

export function ConfigPanel({ config, onChange, disabled }: Props) {
  const d = disabled

  const f   = config.frequency
  const sv  = config.severity
  const pr  = config.pricing
  const po  = config.portfolio
  const ca  = config.capital
  const rc  = config.recycling
  const sim = config.simulation

  return (
    <div className="space-y-0 overflow-y-auto h-full">

      {/* ── SIMULATION ── */}
      <Section title="Simulation" color="slate">
        <Row label="Seasons">
          <NumInput value={sim.nSeasons} min={5} max={40} step={1} disabled={d}
            onChange={(v) => onChange({ simulation: { ...sim, nSeasons: v } })} />
        </Row>
        <Row label="RNG seed (0=random)">
          <NumInput value={sim.seed} min={0} step={1} disabled={d}
            onChange={(v) => onChange({ simulation: { ...sim, seed: v } })} />
        </Row>
        <Row label="Ruin threshold %">
          <NumInput value={sim.ruinThresholdFraction * 100} min={1} max={50} step={1} disabled={d}
            onChange={(v) => onChange({ simulation: { ...sim, ruinThresholdFraction: v / 100 } })} />
        </Row>
        <Row label="MC runs">
          <NumInput value={sim.nMCRuns} min={100} max={50000} step={100} disabled={d}
            onChange={(v) => onChange({ simulation: { ...sim, nMCRuns: v } })} />
        </Row>
      </Section>

      {/* ── CAPITAL ── */}
      <Section title="Capital" color="emerald">
        <Row label="Initial capital ($M)">
          <NumInput value={ca.initialCapitalMusd} min={0.1} step={0.5} disabled={d}
            onChange={(v) => onChange({ capital: { ...ca, initialCapitalMusd: v } })} />
        </Row>
        <Row label="Collateral yield %">
          <NumInput value={ca.collateralYield * 100} min={0} max={20} step={0.1} disabled={d}
            onChange={(v) => onChange({ capital: { ...ca, collateralYield: v / 100 } })} />
        </Row>
        <Row label="Risk-free rate %">
          <NumInput value={ca.riskFreeRate * 100} min={0} max={15} step={0.1} disabled={d}
            onChange={(v) => onChange({ capital: { ...ca, riskFreeRate: v / 100 } })} />
        </Row>
        <Row label="Trapping period (yrs)">
          <NumInput value={ca.trappingPeriodSeasons} min={1} max={5} step={1} disabled={d}
            onChange={(v) => onChange({ capital: { ...ca, trappingPeriodSeasons: v } })} />
        </Row>
      </Section>

      {/* ── RECYCLING ── */}
      <Section title="Recycling" color="emerald">
        <Row label="Mode">
          <SelectInput value={rc.mode} disabled={d}
            options={[{ val: 'full', label: 'Full' }, { val: 'partial', label: 'Partial' }]}
            onChange={(v) => onChange({ recycling: { ...rc, mode: v } })} />
        </Row>
        {rc.mode === 'partial' && (
          <Row label="Redeployment %">
            <NumInput value={rc.redeploymentFraction * 100} min={10} max={100} step={5} disabled={d}
              onChange={(v) => onChange({ recycling: { ...rc, redeploymentFraction: v / 100 } })} />
          </Row>
        )}
      </Section>

      {/* ── FREQUENCY ── */}
      <Section title="Hurricane Frequency" color="rose">
        <Row label="Model">
          <SelectInput value={f.model} disabled={d}
            options={[
              { val: 'poisson',  label: 'Poisson' },
              { val: 'negbinom', label: 'Neg-Binom (clustered)' },
              { val: 'cox',      label: 'Cox / ENSO-modulated' },
            ]}
            onChange={(v) => onChange({ frequency: { ...f, model: v } })} />
        </Row>
        <Row label="Mean annual count">
          <NumInput value={f.meanAnnual} min={0.1} max={6} step={0.1} disabled={d}
            onChange={(v) => onChange({ frequency: { ...f, meanAnnual: v } })} />
        </Row>
        {f.model === 'negbinom' && (
          <Row label="Dispersion k">
            <NumInput value={f.negbinomDispersion} min={0.1} max={20} step={0.1} disabled={d}
              onChange={(v) => onChange({ frequency: { ...f, negbinomDispersion: v } })} />
          </Row>
        )}
      </Section>

      {/* ── PRICING CYCLE ── */}
      <Section title="Pricing Cycle" color="amber">
        <div className="label mb-1">Initial multiples</div>
        <Row label="Junior ×">
          <NumInput value={pr.initMultiple.junior} min={1} max={10} step={0.1} disabled={d}
            onChange={(v) => onChange({ pricing: { ...pr, initMultiple: { ...pr.initMultiple, junior: v } } })} />
        </Row>
        <Row label="Mid ×">
          <NumInput value={pr.initMultiple.mid} min={1} max={12} step={0.1} disabled={d}
            onChange={(v) => onChange({ pricing: { ...pr, initMultiple: { ...pr.initMultiple, mid: v } } })} />
        </Row>
        <Row label="Remote ×">
          <NumInput value={pr.initMultiple.remote} min={1} max={15} step={0.1} disabled={d}
            onChange={(v) => onChange({ pricing: { ...pr, initMultiple: { ...pr.initMultiple, remote: v } } })} />
        </Row>
        <div className="label mt-2 mb-1">Baseline EL (loss-on-line)</div>
        <Row label="Junior EL %">
          <NumInput value={pr.elLolJunior * 100} min={0.5} max={40} step={0.5} disabled={d}
            onChange={(v) => onChange({ pricing: { ...pr, elLolJunior: v / 100 } })} />
        </Row>
        <Row label="Mid EL %">
          <NumInput value={pr.elLolMid * 100} min={0.1} max={15} step={0.1} disabled={d}
            onChange={(v) => onChange({ pricing: { ...pr, elLolMid: v / 100 } })} />
        </Row>
        <Row label="Remote EL %">
          <NumInput value={pr.elLolRemote * 100} min={0.1} max={8} step={0.1} disabled={d}
            onChange={(v) => onChange({ pricing: { ...pr, elLolRemote: v / 100 } })} />
        </Row>
        <div className="label mt-2 mb-1">Cycle dynamics</div>
        <Row label="Cycle sensitivity">
          <NumInput value={pr.cycleSensitivity} min={0} max={2} step={0.05} disabled={d}
            onChange={(v) => onChange({ pricing: { ...pr, cycleSensitivity: v } })} />
        </Row>
        <Row label="Norm. loss ($Bn)">
          <NumInput value={pr.cycleNormBn} min={5} max={200} step={5} disabled={d}
            onChange={(v) => onChange({ pricing: { ...pr, cycleNormBn: v } })} />
        </Row>
        <Row label="Decay factor">
          <NumInput value={pr.decayFactor} min={0.5} max={0.99} step={0.01} disabled={d}
            onChange={(v) => onChange({ pricing: { ...pr, decayFactor: v } })} />
        </Row>
        <Row label="EL drift/hit %">
          <NumInput value={pr.elDriftPerHit * 100} min={0} max={2} step={0.05} disabled={d}
            onChange={(v) => onChange({ pricing: { ...pr, elDriftPerHit: v / 100 } })} />
        </Row>
      </Section>

      {/* ── PORTFOLIO ── */}
      <Section title="Portfolio" color="purple">
        <Row label="Min deals">
          <NumInput value={po.nDealsRange[0]} min={2} max={20} step={1} disabled={d}
            onChange={(v) => onChange({ portfolio: { ...po, nDealsRange: [v, po.nDealsRange[1]] } })} />
        </Row>
        <Row label="Max deals">
          <NumInput value={po.nDealsRange[1]} min={2} max={30} step={1} disabled={d}
            onChange={(v) => onChange({ portfolio: { ...po, nDealsRange: [po.nDealsRange[0], v] } })} />
        </Row>
        <Row label="Max deal weight %">
          <NumInput value={po.maxDealWeight * 100} min={5} max={50} step={5} disabled={d}
            onChange={(v) => onChange({ portfolio: { ...po, maxDealWeight: v / 100 } })} />
        </Row>
        <Row label="Sticky layers">
          <CheckInput value={po.stickyLayers} disabled={d}
            onChange={(v) => onChange({ portfolio: { ...po, stickyLayers: v } })} />
        </Row>
      </Section>

      {/* ── SEVERITY / EXPOSURE ── */}
      <Section title="Cedent Exposure" color="blue">
        <Row label="Market share %">
          <NumInput value={sv.marketShareFraction * 100} min={0.1} max={10} step={0.1} disabled={d}
            onChange={(v) => onChange({ severity: { ...sv, marketShareFraction: v / 100 } })} />
        </Row>
        <Row label="Exp. scale min">
          <NumInput value={sv.exposureScaleRange[0]} min={0.1} max={1} step={0.1} disabled={d}
            onChange={(v) => onChange({ severity: { ...sv, exposureScaleRange: [v, sv.exposureScaleRange[1]] } })} />
        </Row>
        <Row label="Exp. scale max">
          <NumInput value={sv.exposureScaleRange[1]} min={1} max={5} step={0.1} disabled={d}
            onChange={(v) => onChange({ severity: { ...sv, exposureScaleRange: [sv.exposureScaleRange[0], v] } })} />
        </Row>
        <Row label="PML20/PML100 %">
          <NumInput value={sv.pml20FracCentre * 100} min={10} max={60} step={1} disabled={d}
            onChange={(v) => onChange({ severity: { ...sv, pml20FracCentre: v / 100 } })} />
        </Row>
        <Row label="PML50/PML100 %">
          <NumInput value={sv.pml50FracCentre * 100} min={20} max={90} step={1} disabled={d}
            onChange={(v) => onChange({ severity: { ...sv, pml50FracCentre: v / 100 } })} />
        </Row>
      </Section>

    </div>
  )
}
