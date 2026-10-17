import type { ReactNode } from 'react'
import type { Figure } from '../schema.ts'
import type { Translate } from './locales.ts'

/** On-screen teaching figure for the current task. The prompt stays the question; the drawing is the given information. */
export function FigureView({ figure, t }: { figure: Figure; t: Translate }) {
  return <div className="student-figure">{draw(figure, t)}</div>
}

function Frame({ width, height, label, children }: { width: number; height: number; label: string; children: ReactNode }) {
  return <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>{children}</svg>
}

function draw(figure: Figure, t: Translate): ReactNode {
  switch (figure.kind) {
    case 'counter': return <Counter figure={figure} t={t} />
    case 'sticks': return <Sticks figure={figure} t={t} />
    case 'place-value': return <PlaceValue figure={figure} t={t} />
    case 'dot-array': return <DotArray figure={figure} />
    case 'clock': return <Clocks figure={figure} t={t} />
    case 'number-line': return <NumberLine figure={figure} />
    case 'split': return <Split figure={figure} t={t} />
    case 'bar-model': return <BarModel figure={figure} />
    case 'writing': return <Writing figure={figure} t={t} />
    case 'money': return <Money figure={figure} t={t} />
    case 'hundred-chart': return <HundredChart figure={figure} />
    case 'vertical': return <Vertical figure={figure} t={t} />
    case 'shapes': return <ShapeRows figure={figure} t={t} />
    case 'sequence': return <Sequence figure={figure} t={t} />
    case 'plane':
    case 'solid': return <FigureRow figure={figure} />
    case 'overlap': return <Overlap figure={figure} t={t} />
    case 'wall': return <Wall figure={figure} t={t} />
    case 'grid': return <Grid figure={figure} t={t} />
    case 'measure': return <Measure figure={figure} t={t} />
    case 'compass': return <Compass figure={figure} t={t} />
    case 'balance': return <Balance figure={figure} t={t} />
    case 'sketch': return <Sketch figure={figure} t={t} />
    default: return null
  }
}

function Counter({ figure, t }: { figure: Extract<Figure, { kind: 'counter' }>; t: Translate }) {
  const rods = [['百', figure.hundreds], ['十', figure.tens], ['个', figure.ones]] as const
  return <Frame width={240} height={150} label={t('figureCounter')}>{rods.map(([name, beads], index) => {
    const x = 40 + index * 70
    return <g key={name}>
      <line x1={x} y1={20} x2={x} y2={110} />
      {Array.from({ length: beads }, (_, bead) => <circle key={bead} cx={x} cy={100 - bead * 14} r={6} />)}
      <text x={x} y={136} textAnchor="middle">{name}</text>
    </g>
  })}<line x1={24} y1={110} x2={216} y2={110} /></Frame>
}

function Sticks({ figure, t }: { figure: Extract<Figure, { kind: 'sticks' }>; t: Translate }) {
  const width = Math.max(160, figure.bundles * 36 + figure.singles * 12 + 16)
  return <Frame width={width} height={48} label={t('figureSticks')}>{Array.from({ length: figure.bundles }, (_, bundle) => {
    const x = 8 + bundle * 36
    const crossed = (figure.crossBundles ?? 0) > figure.bundles - 1 - bundle
    return <g key={`b${bundle}`}>{Array.from({ length: 10 }, (_, stick) => <line key={stick} x1={x + stick * 2.4} y1={6} x2={x + stick * 2.4} y2={34} />)}<rect x={x} y={16} width={24} height={8} />{crossed && <line x1={x} y1={36} x2={x + 26} y2={4} />}</g>
  })}{Array.from({ length: figure.singles }, (_, stick) => {
    const x = 8 + figure.bundles * 36 + stick * 12
    const crossed = (figure.crossSingles ?? 0) > figure.singles - 1 - stick
    return <g key={`s${stick}`}><line x1={x} y1={6} x2={x} y2={34} />{crossed && <line x1={x - 4} y1={36} x2={x + 4} y2={4} />}</g>
  })}</Frame>
}

function PlaceValue({ figure, t }: { figure: Extract<Figure, { kind: 'place-value' }>; t: Translate }) {
  const ones = figure.ones + (figure.regroup === 'yes' ? 10 : 0)
  const height = 36 + Math.ceil(ones / 10) * 18
  const dot = (cx: number, cy: number, crossed: boolean, dashed: boolean) => <g key={`${cx}-${cy}`}><circle cx={cx} cy={cy} r={6} strokeDasharray={dashed ? '2 2' : undefined} />{crossed && <line x1={cx - 6} y1={cy + 6} x2={cx + 6} y2={cy - 6} />}</g>
  return <Frame width={280} height={height} label="place-value">
    <text x={16} y={16}>{t('figureTensPlace')}</text><text x={150} y={16}>{t('figureOnesPlace')}</text>
    {Array.from({ length: figure.tens }, (_, index) => dot(24 + index * 16, 32, figure.regroup === 'no' && index < figure.crossTens, figure.regroup === 'yes' && index === figure.tens - 1))}
    {Array.from({ length: ones }, (_, index) => dot(158 + (index % 10) * 16, 32 + Math.floor(index / 10) * 18, index < figure.crossOnes, figure.regroup === 'yes' && index >= figure.ones))}
  </Frame>
}

function DotArray({ figure }: { figure: Extract<Figure, { kind: 'dot-array' }> }) {
  return <Frame width={Math.max(80, figure.columns * 18 + 16)} height={figure.rows * 18 + (figure.total !== undefined ? 36 : 16)} label="dot-array">
    {Array.from({ length: figure.rows * figure.columns }, (_, index) => <circle key={index} className="student-fill" cx={16 + (index % figure.columns) * 18} cy={14 + Math.floor(index / figure.columns) * 18} r={3.5} />)}
    {figure.total !== undefined && <text x={(figure.columns * 18) / 2 + 8} y={figure.rows * 18 + 28} textAnchor="middle">{figure.total}</text>}
  </Frame>
}

function Clocks({ figure, t }: { figure: Extract<Figure, { kind: 'clock' }>; t: Translate }) {
  return <Frame width={figure.clocks.length * 120} height={120} label={t('figureClock')}>{figure.clocks.map((clock, index) => {
    const cx = 60 + index * 120
    const cy = 58
    const hand = (angle: number, length: number) => <line x1={cx} y1={cy} x2={cx + Math.sin(angle) * length} y2={cy - Math.cos(angle) * length} />
    return <g key={index}>
      <circle cx={cx} cy={cy} r={46} />
      {Array.from({ length: 12 }, (_, hour) => {
        const angle = (hour + 1) / 12 * Math.PI * 2
        return <text key={hour} x={cx + Math.sin(angle) * 34} y={cy - Math.cos(angle) * 34 + 4} textAnchor="middle">{hour + 1}</text>
      })}
      {hand(((clock.hour % 12) + clock.minute / 60) / 12 * Math.PI * 2, 22)}
      {hand(clock.minute / 60 * Math.PI * 2, 32)}
      <circle className="student-fill" cx={cx} cy={cy} r={2.5} />
    </g>
  })}</Frame>
}

function NumberLine({ figure }: { figure: Extract<Figure, { kind: 'number-line' }> }) {
  const width = 300
  const span = figure.to - figure.from
  const at = (value: number) => 16 + (value - figure.from) / span * (width - 32)
  const ticks = span / figure.step
  return <Frame width={width} height={78} label="number-line">
    <line x1={16} y1={40} x2={width - 16} y2={40} />
    {Array.from({ length: ticks + 1 }, (_, index) => {
      const value = figure.from + index * figure.step
      const x = at(value)
      return <g key={value}><line x1={x} y1={34} x2={x} y2={46} />{ticks <= 16 && <text x={x} y={62} textAnchor="middle">{value}</text>}</g>
    })}
    {(figure.marks ?? []).map(mark => <g key={mark.value}><circle className="student-fill" cx={at(mark.value)} cy={40} r={4} />{mark.label && <text x={at(mark.value)} y={24} textAnchor="middle">{mark.label}</text>}</g>)}
    {(figure.jumps ?? []).map(jump => <path key={`${jump.from}-${jump.to}`} d={`M ${at(jump.from)} 32 Q ${(at(jump.from) + at(jump.to)) / 2} 8 ${at(jump.to)} 32`} />)}
  </Frame>
}

function Split({ figure, t }: { figure: Extract<Figure, { kind: 'split' }>; t: Translate }) {
  const part = 90
  return <Frame width={figure.parts.length * (part + 12)} height={78} label={t('figureSplit')}>{figure.parts.map((item, index) => {
    const x = 8 + index * (part + 12)
    return <g key={index}>
      <Box x={x + 20} y={4} text={item.top} />
      <line x1={x + part / 2} y1={24} x2={x + 22} y2={40} /><line x1={x + part / 2} y1={24} x2={x + part - 22} y2={40} />
      <Box x={x} y={44} text={item.left} /><Box x={x + 48} y={44} text={item.right} />
    </g>
  })}</Frame>
}

function Box({ x, y, text }: { x: number; y: number; text: string }) {
  return <g><rect x={x} y={y} width={40} height={22} />{text !== '' && <text x={x + 20} y={y + 15} textAnchor="middle">{text}</text>}</g>
}

function BarModel({ figure }: { figure: Extract<Figure, { kind: 'bar-model' }> }) {
  const max = Math.max(...figure.bars.map(bar => bar.segments.reduce((sum, segment) => sum + segment.units, 0)))
  const height = figure.bars.reduce((sum, bar) => sum + (bar.total !== undefined ? 18 : 0) + 46, 8)
  let top = 8
  return <Frame width={320} height={height} label="bar-model">{figure.bars.map(bar => {
    const total = bar.total !== undefined
    const y = top + (total ? 18 : 0)
    const length = bar.segments.reduce((sum, segment) => sum + segment.units, 0) / max * 220
    let cursor = 72
    const row = <g key={bar.name}>
      {total && <text x={72 + length / 2} y={top + 12} textAnchor="middle">{bar.total}</text>}
      <text x={64} y={y + 16} textAnchor="end">{bar.name}</text>
      {bar.segments.map((segment, index) => {
        const segmentWidth = segment.units / max * 220
        const cell = <g key={index}><rect x={cursor} y={y} width={segmentWidth} height={20} strokeDasharray={segment.style === 'dashed' ? '3 3' : undefined} />{segment.label !== '' && <text x={cursor + segmentWidth / 2} y={y + 34} textAnchor="middle">{segment.label}</text>}</g>
        cursor += segmentWidth
        return cell
      })}
    </g>
    top = y + 46
    return row
  })}</Frame>
}

function Writing({ figure, t }: { figure: Extract<Figure, { kind: 'writing' }>; t: Translate }) {
  if (figure.style === 'fourline') {
    return <Frame width={280} height={48} label={t('figureFourline')}>{[8, 18, 28, 38].map(y => <line key={y} x1={12} y1={y} x2={268} y2={y} />)}{figure.example && <text x={20} y={32}>{figure.example}</text>}</Frame>
  }
  const count = figure.count ?? 4
  return <Frame width={count * 44 + 8} height={52} label={t('figureTianzige')}>{Array.from({ length: count }, (_, index) => {
    const x = 8 + index * 44
    return <g key={index}><rect x={x} y={6} width={36} height={36} /><line x1={x + 18} y1={6} x2={x + 18} y2={42} strokeDasharray="2 2" /><line x1={x} y1={24} x2={x + 36} y2={24} strokeDasharray="2 2" />{index === 0 && figure.example && <text x={x + 18} y={30} textAnchor="middle">{figure.example}</text>}</g>
  })}</Frame>
}

function Money({ figure, t }: { figure: Extract<Figure, { kind: 'money' }>; t: Translate }) {
  const items = figure.items.flatMap(item => typeof item === 'string' ? [item] : Array.from({ length: item.count }, () => item.denomination))
  const perRow = 4
  return <Frame width={280} height={Math.ceil(items.length / perRow) * 48 + 8} label={t('figureMoney')}>{items.map((value, index) => {
    const x = 12 + (index % perRow) * 68
    const y = 8 + Math.floor(index / perRow) * 48
    const note = value.endsWith('元') && value !== '1元'
    return <g key={index}>{note ? <rect x={x} y={y} width={60} height={32} /> : <circle cx={x + 18} cy={y + 16} r={16} />}<text x={note ? x + 30 : x + 18} y={y + 21} textAnchor="middle">{value}</text></g>
  })}</Frame>
}

function HundredChart({ figure }: { figure: Extract<Figure, { kind: 'hundred-chart' }> }) {
  if (figure.window) {
    const center = figure.window.center
    return <Frame width={96} height={96} label="hundred-chart">{[-1, 0, 1].flatMap(row => [-1, 0, 1].map(column => {
      const value = center + row * 10 + column
      const x = (column + 1) * 30
      const y = (row + 1) * 30
      return <g key={`${row}-${column}`}><rect x={x} y={y} width={28} height={28} />{row === 0 && column === 0 && <text x={x + 14} y={y + 18} textAnchor="middle">{value}</text>}</g>
    }))}</Frame>
  }
  const hidden = new Set(figure.hidden ?? [])
  return <Frame width={230} height={230} label="hundred-chart">{Array.from({ length: 100 }, (_, index) => {
    const x = (index % 10) * 22 + 6
    const y = Math.floor(index / 10) * 22 + 6
    const number = index + 1
    return <g key={number}><rect x={x} y={y} width={20} height={20} />{!hidden.has(number) && <text x={x + 10} y={y + 14} textAnchor="middle">{number}</text>}</g>
  })}</Frame>
}

function Vertical({ figure, t }: { figure: Extract<Figure, { kind: 'vertical' }>; t: Translate }) {
  return <Frame width={figure.count * 110} height={100} label={t('figureVertical')}>{Array.from({ length: figure.count }, (_, frame) => {
    const x = 16 + frame * 110
    return <g key={frame}>{[0, 1, 3].flatMap(row => [0, 1, 2].map(column => <rect key={`${row}-${column}`} x={x + column * 22} y={row * 22} width={20} height={20} />))}<line x1={x} y1={54} x2={x + 66} y2={54} /></g>
  })}</Frame>
}

function ShapeRows({ figure, t }: { figure: Extract<Figure, { kind: 'shapes' }>; t: Translate }) {
  return <Frame width={280} height={figure.rows.length * 32 + 8} label={t('figureShapes')}>{figure.rows.map((row, index) => <g key={row.name}>
    <text x={48} y={index * 32 + 22} textAnchor="end">{row.name}</text>
    {Array.from({ length: row.count }, (_, item) => <Small key={item} shape={row.shape} x={64 + item * 18} y={index * 32 + 16} />)}
  </g>)}</Frame>
}

function Small({ shape, x, y }: { shape: 'circle' | 'square' | 'triangle' | 'star'; x: number; y: number }) {
  if (shape === 'circle') return <circle cx={x} cy={y} r={6} />
  if (shape === 'square') return <rect x={x - 6} y={y - 6} width={12} height={12} />
  if (shape === 'triangle') return <polygon points={`${x},${y - 7} ${x + 7},${y + 6} ${x - 7},${y + 6}`} />
  return <polygon points={`${x},${y - 7} ${x + 2},${y - 2} ${x + 7},${y - 2} ${x + 3},${y + 1} ${x + 5},${y + 7} ${x},${y + 3} ${x - 5},${y + 7} ${x - 3},${y + 1} ${x - 7},${y - 2} ${x - 2},${y - 2}`} />
}

function Sequence({ figure, t }: { figure: Extract<Figure, { kind: 'sequence' }>; t: Translate }) {
  const count = figure.items.reduce((sum, item) => sum + item.count, 0) + (figure.blank ?? 0)
  let cursor = 16
  return <Frame width={Math.max(80, count * 22 + 16)} height={40} label={t('figureSequence')}>
    {figure.items.flatMap(item => Array.from({ length: item.count }, () => {
      const shape = <Small key={cursor} shape={item.shape} x={cursor} y={18} />
      cursor += 22
      return shape
    }))}
    {Array.from({ length: figure.blank ?? 0 }, () => {
      const box = <rect key={cursor} x={cursor - 8} y={8} width={16} height={16} strokeDasharray="2 2" />
      cursor += 22
      return box
    })}
  </Frame>
}

function FigureRow({ figure }: { figure: Extract<Figure, { kind: 'plane' | 'solid' }> }) {
  const total = figure.items.reduce((sum, item) => sum + item.count, 0)
  let cursor = 20
  return <Frame width={Math.max(80, total * 28 + figure.items.length * 16)} height={figure.mark === 'yes' ? 64 : 44} label={figure.kind}>{figure.items.map(item => {
    const group = <g key={cursor}>{Array.from({ length: item.count }, (_, index) => {
      const shape = figure.kind === 'solid'
        ? <rect key={index} x={cursor + index * 26} y={8} width={18} height={16} />
        : <Small key={index} shape={item.shape === 'circle' || item.shape === 'square' || item.shape === 'triangle' ? item.shape : 'square'} x={cursor + index * 26 + 8} y={16} />
      return shape
    })}{figure.mark === 'yes' && <rect x={cursor} y={36} width={24} height={14} />}</g>
    cursor += item.count * 26 + 16
    return group
  })}</Frame>
}

function Overlap({ figure, t }: { figure: Extract<Figure, { kind: 'overlap' }>; t: Translate }) {
  return <Frame width={220} height={figure.total !== undefined ? 150 : 120} label={t('figureOverlap')}>
    <circle cx={78} cy={68} r={46} /><circle cx={142} cy={68} r={46} />
    <text x={78} y={16} textAnchor="middle">{figure.left}</text>
    <text x={142} y={16} textAnchor="middle">{figure.right}</text>
    <text x={48} y={72} textAnchor="middle">{figure.leftOnly}</text>
    <text x={110} y={72} textAnchor="middle">{figure.both}</text>
    <text x={172} y={72} textAnchor="middle">{figure.rightOnly}</text>
    {figure.total !== undefined && <text x={110} y={136} textAnchor="middle">{figure.total}</text>}
  </Frame>
}

function Wall({ figure, t }: { figure: Extract<Figure, { kind: 'wall' }>; t: Translate }) {
  const widest = figure.rows.reduce((max, row) => Math.max(max, row.length), 0)
  return <Frame width={widest * 48 + 16} height={figure.rows.length * 28 + 8} label={t('figureWall')}>{figure.rows.map((row, rowIndex) => {
    const left = (widest - row.length) * 24 + 8
    return row.map((cell, column) => <g key={`${rowIndex}-${column}`}><rect x={left + column * 48} y={rowIndex * 28 + 4} width={46} height={24} />{cell !== '' && <text x={left + column * 48 + 23} y={rowIndex * 28 + 20} textAnchor="middle">{cell}</text>}</g>)
  })}</Frame>
}

function Grid({ figure, t }: { figure: Extract<Figure, { kind: 'grid' }>; t: Translate }) {
  const columns = figure.rows.reduce((max, row) => Math.max(max, row.cells.length), 0)
  const header = figure.columns !== undefined ? 1 : 0
  return <Frame width={columns * 40 + 48} height={(figure.rows.length + header) * 28 + 8} label={t('figureGrid')}>
    {figure.columns?.map((head, index) => <g key={head}><rect x={40 + index * 40} y={4} width={38} height={24} /><text x={59 + index * 40} y={20} textAnchor="middle">{head}</text></g>)}
    {figure.rows.map((row, rowIndex) => <g key={rowIndex}>
      {row.name && <text x={36} y={header * 28 + rowIndex * 28 + 20} textAnchor="end">{row.name}</text>}
      {row.cells.map((cell, column) => <g key={column}><rect x={40 + column * 40} y={4 + (rowIndex + header) * 28} width={38} height={24} />{cell !== '' && <text x={59 + column * 40} y={(rowIndex + header) * 28 + 20} textAnchor="middle">{cell}</text>}</g>)}
    </g>)}
  </Frame>
}

function Measure({ figure, t }: { figure: Extract<Figure, { kind: 'measure' }>; t: Translate }) {
  return <Frame width={280} height={figure.bars.length * 24 + (figure.ruler === 'yes' ? 36 : 12)} label={t('figureMeasure')}>
    {figure.bars.map((bar, index) => <line key={bar.name} x1={16} y1={16 + index * 24} x2={16 + Math.min(bar.length, 15) * 16} y2={16 + index * 24} />)}
    {figure.ruler === 'yes' && Array.from({ length: 16 }, (_, cm) => <g key={cm}><line x1={16 + cm * 16} y1={figure.bars.length * 24 + 8} x2={16 + cm * 16} y2={figure.bars.length * 24 + 16} /><text x={16 + cm * 16} y={figure.bars.length * 24 + 30} textAnchor="middle">{cm}</text></g>)}
  </Frame>
}

function Compass({ figure, t }: { figure: Extract<Figure, { kind: 'compass' }>; t: Translate }) {
  const blank = figure.blank === 'yes'
  const direction = (name: 'compassNorth' | 'compassSouth' | 'compassWest' | 'compassEast') => blank ? '' : t(name)
  return <Frame width={180} height={160} label={t('figureCompass')}>
    <line x1={90} y1={24} x2={90} y2={136} /><line x1={24} y1={80} x2={156} y2={80} />
    <text x={90} y={18} textAnchor="middle">{direction('compassNorth')}</text>
    <text x={90} y={154} textAnchor="middle">{direction('compassSouth')}</text>
    <text x={12} y={84}>{direction('compassWest')}</text>
    <text x={176} y={84} textAnchor="end">{direction('compassEast')}</text>
  </Frame>
}

function Balance({ figure, t }: { figure: Extract<Figure, { kind: 'balance' }>; t: Translate }) {
  const drop = figure.tilt === 'left' ? 16 : figure.tilt === 'right' ? -16 : 0
  return <Frame width={220} height={110} label={t('figureBalance')}>
    <line x1={110} y1={28} x2={110} y2={90} /><line x1={70} y1={90} x2={150} y2={90} />
    <line x1={40} y1={28 + drop} x2={180} y2={28 - drop} />
    <text x={40} y={24 + drop} textAnchor="middle">{figure.left}</text>
    <text x={180} y={24 - drop} textAnchor="middle">{figure.right}</text>
  </Frame>
}

function Sketch({ figure, t }: { figure: Extract<Figure, { kind: 'sketch' }>; t: Translate }) {
  return <Frame width={480} height={figure.height} label={t('figureSketch')}>{figure.elements.map((element, index) => {
    if (element.draw === 'line' || element.draw === 'arrow') return <line key={index} x1={element.from.x} y1={element.from.y} x2={element.to.x} y2={element.to.y} />
    if (element.draw === 'polyline') return <polyline key={index} points={element.points.map(point => `${point.x},${point.y}`).join(' ')} fill={element.closed === 'yes' ? 'none' : 'none'} />
    if (element.draw === 'rect') return <rect key={index} x={element.x} y={element.y} width={element.width} height={element.height} />
    if (element.draw === 'circle') return <circle key={index} cx={element.x} cy={element.y} r={element.radius} />
    return <text key={index} x={element.x} y={element.y} textAnchor={element.align === 'center' ? 'middle' : 'start'}>{element.label}</text>
  })}</Frame>
}
