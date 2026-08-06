import type { TrainingPlanStage } from './trainingPlanTypes'

export const TRAINING_PLAN_STAGES: TrainingPlanStage[] = [
  {
    id: 'stage-1',
    order: 1,
    title: '第一阶段：重建基础与连续节拍',
    period: '第1-3个月',
    goal: '纠正原有练琴方式，建立连续节拍，掌握基础音阶、和弦与分解和弦，完成《Una Mattina》。',
    focuses: ['连续节拍', '六个基础调', '三和弦与转位', '分解和弦', '基础视奏'],
    coreMaterials: ['布格缪勒 Op.100 No.1《坦诉》', '佩措尔德《G大调小步舞曲》BWV Anh.114'],
    applicationPieces: ['《Una Mattina》', '预读《Kiss the Rain》'],
    acceptanceCriteria: [
      'C、G、F大调及a、e、d小调建立基础手型',
      '单手两八度连续',
      'C、G、F大调可双手慢速完成',
      '三和弦原位、第一转位、第二转位可直接反应',
      '固定速度连续演奏16小节',
      '陌生简单谱可连续读完8小节',
      '《Una Mattina》可慢速完整演奏',
      '手腕无明显酸痛'
    ],
    risks: ['继续逐拍停车', '同时开始过多曲目', '追求速度而忽视连续', '左手每拍重新启动'],
    projects: [
      {
        id: 'stage-1-major-scales-cgf', category: '音阶', title: 'C、G、F大调音阶',
        content: '单手两组八度，再逐步加入双手慢速上行与上下行。', objective: '建立三个基础大调的连续手型。',
        acceptance: '单手两八度连续，双手可在慢速下不中断完成。', taskType: 'software', linkedModule: 'scale',
        recommendedSettings: ['调性：C / G / F', '音域：两组八度', '每拍1音，60 BPM起步'], difficulty: 'basic'
      },
      {
        id: 'stage-1-minor-scales-aed', category: '音阶', title: 'a、e、d小调音阶',
        content: '在真实钢琴上按可靠指法谱练习自然、和声或旋律小调。', objective: '建立关系小调基础手型。',
        acceptance: '三个小调可单手两八度慢速连续。', notes: '当前软件尚未支持小调音阶，请使用纸质或可靠电子指法谱。',
        taskType: 'manual', difficulty: 'basic'
      },
      {
        id: 'stage-1-triad-inversions', category: '和弦', title: '三和弦与两个转位',
        content: '训练大、小三和弦原位、第一转位和第二转位。', objective: '看到或听到根音后快速形成和弦手型。',
        acceptance: 'C、F、G、Am、Dm、Em三个位置可直接反应。', taskType: 'software', linkedModule: 'chord',
        recommendedSettings: ['训练内容：三和弦识别', '转位：全部转位', '10题起步'], difficulty: 'basic'
      },
      {
        id: 'stage-1-broken-chords', category: '和弦', title: 'C、F、G、Am、Dm、Em分解和弦',
        content: '柱式确认音高后，以固定顺序分解演奏。', objective: '让左手分解型持续运行。',
        acceptance: '六个和弦可连续循环，不在每拍重新启动。', taskType: 'software', linkedModule: 'chord',
        notes: '软件用于和弦音与顺序检查，具体指法和连贯触键仍需在琴上确认。',
        recommendedSettings: ['训练内容：分解和弦', '调性：C大调', '1-2轮'], difficulty: 'intermediate'
      },
      {
        id: 'stage-1-subdivisions', category: '节奏协调', title: '一拍1、2、3、4个音及四对二',
        content: '先在固定音上建立等分，再转移到双手。', objective: '建立共同时间轴，不依赖逐拍停车。',
        acceptance: '固定速度下各细分可连续16拍，四对二需在琴上补充。', taskType: 'software', linkedModule: 'rhythm',
        notes: '软件可练1、2、3、4等分及三对二；四对二需结合协调页面和线下练习。',
        recommendedSettings: ['基础节奏 / 三连音', '标准宽容度', '60 BPM'], difficulty: 'intermediate'
      },
      {
        id: 'stage-1-daily-sight-reading', category: '视奏', title: '每天陌生简单谱4-8小节',
        content: '软件练单音识别，随后在真实短谱上连续读完。', objective: '眼睛向前，错音后继续。',
        acceptance: '陌生简单谱可连续读完8小节。', taskType: 'software', linkedModule: 'sight-reading',
        notes: '软件不支持完整曲谱视奏判定，真实短谱部分必须线下完成。',
        recommendedSettings: ['大谱表', '常用音域', '音名隐藏'], difficulty: 'basic'
      },
      {
        id: 'stage-1-burgmuller-confidence', category: '练习曲', title: '布格缪勒《坦诉》',
        content: '分段处理旋律、伴奏延续与段落连接。', objective: '把分解和弦技术迁移到练习曲。',
        acceptance: '慢速完整演奏，左手持续且旋律清楚。', taskType: 'repertoire', difficulty: 'basic'
      },
      {
        id: 'stage-1-minuet-g', category: '古典作品', title: '《G大调小步舞曲》',
        content: '训练三拍子脉搏、乐句与小节连接。', objective: '建立不在小节线停车的习惯。',
        acceptance: '从头到尾保持三拍子和基本乐句。', taskType: 'repertoire', difficulty: 'basic'
      },
      {
        id: 'stage-1-una-mattina', category: '主练曲', title: '完成《Una Mattina》',
        content: '按段落完成读谱、合手和连接。', objective: '应用持续伴奏与旋律平衡。',
        acceptance: '可慢速完整演奏，明显停顿不超过预先记录的位置。', taskType: 'repertoire', difficulty: 'intermediate'
      },
      {
        id: 'stage-1-kiss-the-rain-preview', category: '预读曲目', title: '预读《Kiss the Rain》',
        content: '只读谱和标记和声，不急于完整合手。', objective: '为第二阶段主练曲减少逐音硬磨。',
        acceptance: '完成结构、和弦与主要难点标记。', taskType: 'repertoire', difficulty: 'intermediate'
      }
    ]
  },
  {
    id: 'stage-2',
    order: 2,
    title: '第二阶段：协调与伴奏自动化',
    period: '第4-6个月',
    goal: '建立初中级协调能力，让左手伴奏持续运行，训练快速五指、简单复调和古典结构。',
    focuses: ['累计9-12个大小调', '基础琶音', '后半拍和简单切分', '三对二入门', '固定伴奏自动化', '复调入门'],
    coreMaterials: ['布格缪勒《阿拉贝斯克》', '车尔尼599选曲', '舒曼《旋律》Op.68 No.1', '克列门蒂 Op.36 No.1 第一乐章', '巴赫初级作品'],
    applicationPieces: ['《Kiss the Rain》', '《Comptine d’un autre été》'],
    acceptanceCriteria: [
      '累计9-12个大小调建立基础手型', '基础调琶音单手两八度连续', '简单切分和三对二能在固定音上稳定完成',
      '陌生谱连续视奏16小节', '简单新曲可在一至两周内慢速合手', '至少完成一首应用曲'
    ],
    risks: ['只练分解和弦型流行曲', '左手每次循环重新启动', '逃避黑键调', '只练曲目开头'],
    projects: [
      {
        id: 'stage-2-major-scales-dab-flat', category: '音阶', title: 'D、A、降B大调',
        content: '单手两组八度，并逐步加入双手上下行。', objective: '进入带两个以上升降号的调性。',
        acceptance: '三个大调可在固定慢速下连续完成。', taskType: 'software', linkedModule: 'scale',
        recommendedSettings: ['调性：D / A / Bb', '两组八度', '上下行'], difficulty: 'intermediate'
      },
      {
        id: 'stage-2-minor-scales-b-fsharp-g', category: '音阶', title: 'b、升f、g小调',
        content: '使用指法谱在线下逐个建立小调手型。', objective: '扩展关系小调和黑键手型。',
        acceptance: '三个小调可单手两八度连续。', notes: '当前软件不支持小调音阶。', taskType: 'manual', difficulty: 'intermediate'
      },
      {
        id: 'stage-2-basic-arpeggios', category: '琶音', title: '基础琶音',
        content: 'C、G、F及关系小调单手两八度琶音。', objective: '形成跨指和手臂移动的连续路线。',
        acceptance: '基础调琶音单手两八度均匀。', notes: '当前软件没有完整琶音与指法判定，请在线下完成。', taskType: 'manual', difficulty: 'intermediate'
      },
      {
        id: 'stage-2-chord-progressions', category: '和弦连接', title: 'C-G-Am-F与F-G-Am进行',
        content: '先柱式，再转为分解或固定伴奏型。', objective: '让和弦连接不打断时间轴。',
        acceptance: '两组进行可循环四轮且无明显停顿。', taskType: 'software', linkedModule: 'chord',
        recommendedSettings: ['I-V-vi-IV', 'C / F大调', '柱式后分解'], difficulty: 'intermediate'
      },
      {
        id: 'stage-2-syncopation-polyrhythm', category: '节奏协调', title: '后半拍、切分与三对二',
        content: '固定音完成后转移到左右手。', objective: '稳定处理非正拍进入。',
        acceptance: '简单切分和三对二在慢速下连续完成。', taskType: 'software', linkedModule: 'coordination',
        recommendedSettings: ['异步节奏 / 三对二', '40-60 BPM'], difficulty: 'challenge'
      },
      {
        id: 'stage-2-sight-reading', category: '视奏', title: '每天8-16小节视奏',
        content: '软件识别音高，线下使用陌生短谱保持连续。', objective: '扩大预读范围并减少回看。',
        acceptance: '陌生谱可连续视奏16小节。', notes: '完整短谱仍需线下完成。', taskType: 'software', linkedModule: 'sight-reading',
        recommendedSettings: ['大谱表', '扩展音域', '音名隐藏'], difficulty: 'intermediate'
      },
      { id: 'stage-2-arabesque', category: '练习曲', title: '布格缪勒《阿拉贝斯克》', content: '训练快速五指与轻巧触键。', objective: '建立短句快速均匀能力。', acceptance: '目标速度附近连续演奏且不砸键。', taskType: 'repertoire', difficulty: 'intermediate' },
      { id: 'stage-2-czerny-599', category: '练习曲', title: '车尔尼599选曲', content: '选择与当前薄弱技术对应的条目。', objective: '提高五指、转指和伴奏自动化。', acceptance: '至少完成两首并记录技术问题。', taskType: 'repertoire', difficulty: 'intermediate' },
      { id: 'stage-2-schumann-melody', category: '古典作品', title: '舒曼《旋律》', content: '处理旋律线、伴奏平衡和乐句。', objective: '建立抒情触键与声部层次。', acceptance: '右手旋律清楚，左手不过重。', taskType: 'repertoire', difficulty: 'intermediate' },
      { id: 'stage-2-clementi-op36', category: '奏鸣曲', title: '克列门蒂 Op.36 No.1', content: '练习第一乐章结构和段落连接。', objective: '进入古典奏鸣曲结构。', acceptance: '第一乐章可慢速完整演奏。', taskType: 'repertoire', difficulty: 'intermediate' },
      { id: 'stage-2-bach-entry', category: '复调', title: '巴赫复调入门', content: '选择初级作品分手梳理声部。', objective: '建立两手独立线路。', acceptance: '能指出并分别演奏主要声部。', taskType: 'repertoire', difficulty: 'intermediate' },
      { id: 'stage-2-application-piece', category: '主练曲', title: '《Kiss the Rain》或《Comptine》', content: '选择一首完成读谱、合手与整曲连接。', objective: '应用固定左手伴奏。', acceptance: '至少完成一首应用曲。', taskType: 'repertoire', difficulty: 'intermediate' }
    ]
  },
  {
    id: 'stage-3',
    order: 3,
    title: '第三阶段：进入五至六级能力区间',
    period: '第7-12个月',
    goal: '使基础技术可以迁移到新曲，加强复调、长篇结构和中速跑动。',
    focuses: ['补齐常见大小调', '双手琶音', '三和弦转位', '属七和弦', '切分与三对二', '连续四对二', '中速跑动', '复调和长篇结构'],
    coreMaterials: ['布格缪勒《叙事曲》', '布格缪勒《天使的和声》', '车尔尼599后段或849前段', '巴赫《C大调小前奏曲》BWV 939等', '克列门蒂或库劳小奏鸣曲'],
    applicationPieces: ['《La Valse d’Amélie》', '《Call of Silence》A大调版', '《The Truth That You Leave》', '《月光奏鸣曲》第一乐章复查'],
    acceptanceCriteria: ['常见调音阶能够双手连续', '双手琶音慢速均匀', '属七和弦与转位换位基本稳定', '节拍器下连续完成32小节', '完成简单复调作品', '完整演奏一个小奏鸣曲乐章', '连续弹奏5-8分钟无明显酸痛', '新练习曲能够在数周内完成'],
    risks: ['把熟曲演奏等同于综合能力', '只追求速度', '不处理身体紧张', '只会背谱而不能迁移'],
    projects: [
      { id: 'stage-3-common-major-scales', category: '音阶', title: '常见大调双手连续', content: '在十二大调中按掌握顺序补齐并提高连续性。', objective: '让大调手型可迁移到新曲。', acceptance: '常见大调双手两组八度连续。', taskType: 'software', linkedModule: 'scale', recommendedSettings: ['两组八度', '上下行', '每拍2音'], difficulty: 'challenge' },
      { id: 'stage-3-common-minor-scales', category: '音阶', title: '补齐常见小调', content: '在线下按指法谱补齐自然、和声或旋律小调。', objective: '避免能力只集中在大调。', acceptance: '常见小调可双手慢速连续。', notes: '软件尚未支持小调。', taskType: 'manual', difficulty: 'challenge' },
      { id: 'stage-3-two-hand-arpeggios', category: '琶音', title: '双手琶音', content: '从慢速分手过渡到双手同向。', objective: '建立跨八度连续移动。', acceptance: '基础调双手琶音慢速均匀。', notes: '需在线下按正确指法完成。', taskType: 'manual', difficulty: 'challenge' },
      { id: 'stage-3-seventh-chords', category: '和弦', title: '属七和弦与转位', content: '随机根音训练属七和弦及三个转位。', objective: '提高四音和弦识别和换位。', acceptance: '常见根音的属七和弦与转位基本稳定。', taskType: 'software', linkedModule: 'chord', recommendedSettings: ['七和弦识别', '属七和弦', '全部转位'], difficulty: 'challenge' },
      { id: 'stage-3-rhythm-transfer', category: '节奏协调', title: '切分、三对二与连续四对二', content: '软件练切分和三对二，四对二在线下迁移到音阶或片段。', objective: '维持复杂细分下的共同脉搏。', acceptance: '切分和三对二稳定，四对二连续完成。', taskType: 'software', linkedModule: 'coordination', notes: '四对二需在线下补充。', difficulty: 'challenge' },
      { id: 'stage-3-long-sight-reading', category: '视奏', title: '连续视奏与新曲迁移', content: '软件保持读音训练，线下视奏16-32小节短谱。', objective: '让新曲学习从读谱开始而非背键。', acceptance: '陌生短谱不中断读完主要结构。', taskType: 'software', linkedModule: 'sight-reading', notes: '软件不判定完整曲谱。', difficulty: 'challenge' },
      { id: 'stage-3-burgmuller-pieces', category: '练习曲', title: '《叙事曲》与《天使的和声》', content: '分别处理强节奏与分解和弦延续。', objective: '把两类技术迁移到音乐表达。', acceptance: '至少完成一首，另一首完成主要段落。', taskType: 'repertoire', difficulty: 'challenge' },
      { id: 'stage-3-czerny-transition', category: '练习曲', title: '车尔尼599后段或849前段', content: '选择中速跑动与转指条目。', objective: '进入六级附近手指训练。', acceptance: '一首新练习曲可在数周内完成。', taskType: 'repertoire', difficulty: 'challenge' },
      { id: 'stage-3-bach-prelude', category: '复调', title: '巴赫小前奏曲', content: '分声部、分句和合手整理。', objective: '强化主题线路与双手独立。', acceptance: '完成一首简单复调作品。', taskType: 'repertoire', difficulty: 'challenge' },
      { id: 'stage-3-sonatina-movement', category: '奏鸣曲', title: '完整小奏鸣曲乐章', content: '选择克列门蒂或库劳一个乐章。', objective: '建立长篇结构与段落连接。', acceptance: '从头到尾保持结构和基本节拍。', taskType: 'repertoire', difficulty: 'challenge' },
      { id: 'stage-3-application-piece', category: '主练曲', title: '第三阶段应用曲目', content: '从Amélie、Call of Silence、The Truth或月光第一乐章中选择。', objective: '检验技术迁移和耐力。', acceptance: '完成至少一首或一次完整复查。', taskType: 'repertoire', difficulty: 'challenge' }
    ]
  },
  {
    id: 'stage-4',
    order: 4,
    title: '第四阶段：稳定六级综合能力',
    period: '第13-18个月',
    goal: '使技术、练习曲、复调、奏鸣曲和喜欢的曲目处于相近水平。',
    focuses: ['常见大小调音阶、琶音、和弦综合', '车尔尼849', '巴赫二部创意曲', '完整奏鸣曲', '六级附近新曲迁移', '长时间身体稳定'],
    coreMaterials: ['车尔尼849', '巴赫二部创意曲 No.1 BWV 772', '克列门蒂或库劳奏鸣曲', '舒曼或布格缪勒抒情作品'],
    applicationPieces: ['《我与你》较简单版本', '《The Truth That You Leave》同档新曲', '《エカテリーナのための協奏曲》30-60秒选段'],
    acceptanceCriteria: ['常见大小调技术能够双手连续完成', '车尔尼849练习内容可迁移', '二部创意曲中两手线路清楚', '完整奏鸣曲从头到尾保持结构和节拍', '五至六级新曲能在数周内完成', '连续弹奏5-10分钟身体稳定', '六级验收清单大部分项目达标'],
    risks: ['用熟曲掩盖读谱短板', '直接硬攻高阶整曲', '忽视复调和古典结构', '只练熟悉调性'],
    projects: [
      { id: 'stage-4-major-scale-integration', category: '基础技术', title: '十二大调综合', content: '按周轮换上行、下行、上下行、双八度与速度训练。', objective: '让常见大调成为可调用技术。', acceptance: '常见大调双手连续且能按目标速度完成。', taskType: 'software', linkedModule: 'scale', recommendedSettings: ['两组八度', '每拍2-4音', '循环2-4次'], difficulty: 'challenge' },
      { id: 'stage-4-minor-arpeggio-integration', category: '基础技术', title: '小调与琶音综合', content: '在线下轮换常见小调和双手琶音。', objective: '补齐软件暂不覆盖的六级技术。', acceptance: '常见小调和琶音可双手连续。', notes: '必须使用真实钢琴和可靠指法资料。', taskType: 'manual', difficulty: 'challenge' },
      { id: 'stage-4-chord-integration', category: '和声技术', title: '三和弦、七和弦与连接综合', content: '轮换七和弦、转位、和弦连接和4536251。', objective: '独立判断和弦延续、转位与伴奏型。', acceptance: '常见和弦能快速反应并连续连接。', taskType: 'software', linkedModule: 'chord', recommendedSettings: ['七和弦全部类型', '全部转位', '4536251柱式/分解'], difficulty: 'challenge' },
      { id: 'stage-4-rhythm-coordination', category: '综合技术', title: '复杂节奏与双手协调', content: '混合切分、三连音、三对二和异步伴奏。', objective: '在两手不同任务下保持共同时间轴。', acceptance: '复杂模板慢速稳定，理论同点同步。', taskType: 'software', linkedModule: 'coordination', recommendedSettings: ['异步节奏 / 三对二', '40-80 BPM'], difficulty: 'challenge' },
      { id: 'stage-4-czerny-849', category: '练习曲', title: '车尔尼849', content: '选择与薄弱技术对应的条目并迁移到作品。', objective: '建立六级附近中速跑动。', acceptance: '完成若干条目并记录迁移到作品的结果。', taskType: 'repertoire', difficulty: 'challenge' },
      { id: 'stage-4-bach-invention', category: '复调', title: '巴赫二部创意曲 No.1', content: '分声部分析、主题追踪和慢速合手。', objective: '建立清晰的双手线路。', acceptance: '两手主题清楚，合手时无一手放空。', taskType: 'repertoire', difficulty: 'challenge' },
      { id: 'stage-4-complete-sonata', category: '奏鸣曲', title: '完整奏鸣曲', content: '选择克列门蒂或库劳作品完成多个乐章。', objective: '维持长篇结构、节拍和耐力。', acceptance: '从头到尾保持结构和节拍。', taskType: 'repertoire', difficulty: 'challenge' },
      { id: 'stage-4-lyrical-piece', category: '抒情作品', title: '舒曼或布格缪勒抒情作品', content: '训练旋律层次、伴奏平衡和踏板基础。', objective: '让技术服务于声音控制。', acceptance: '旋律清楚、伴奏不过重、踏板不混浊。', taskType: 'repertoire', difficulty: 'challenge' },
      { id: 'stage-4-new-piece-transfer', category: '迁移测试', title: '六级附近新曲迁移', content: '选择同档新曲或30-60秒困难选段。', objective: '验证新曲能在数周而非数月内完成。', acceptance: '形成读谱、分段、合手、整曲的可重复流程。', taskType: 'repertoire', difficulty: 'challenge' }
    ]
  }
]

export function getTrainingPlanStage(stageId: string): TrainingPlanStage {
  return TRAINING_PLAN_STAGES.find((stage) => stage.id === stageId) ?? TRAINING_PLAN_STAGES[0]
}

