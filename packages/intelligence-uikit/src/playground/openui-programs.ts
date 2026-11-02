// Adapted from thesysdev/open-intelligent-ui gallery programs (Apache-2.0).
export const openUIPrograms = [
  {
    id: 'answer', title: 'An answer, composed', note: 'A readable answer made of headings, facts and useful detail.',
    code: `root = Col([title, intro, facts, Title("Before you go", "md"), tips])
title = Title("A slow Saturday in Lisbon", "lg")
intro = Text("Start by the river, climb into Alfama for lunch, and end the day at a miradouro with the city below you.")
facts = Row([Badge("6.4 km walking", "info"), Badge("€6.80 day pass", "success"), Badge("Sunset 7:42 PM")], 2, null, null, true)
tips = Markdown("- Trams 28 and 12 get crowded after 10 AM.\\n- Wear shoes with grip: the cobbles are polished smooth.\\n- Most museums close on **Mondays**.")`,
  },
  {
    id: 'text', title: 'Text & hierarchy', note: 'Rich prose, an attributed quote, code and links.',
    code: `root = Col([Title("A little clarity goes a long way", "lg"), Text("Typography keeps the answer easy to read.", "sm", "muted"), Quote("Simplicity is about subtracting the obvious and adding the meaningful.", "John Maeda"), List(["Bring useful details forward", "Keep the next action clear"], "number"), Code("const answer = 42", "typescript"), Link("Read the OpenUI docs", "https://openui.com")])`,
  },
  {
    id: 'state', title: 'Inputs → state → answer', note: 'Change a name, adjust the group size, or send a new request.',
    code: `root = Col([Title("Make it yours", "lg"), field, echo, Slider($guests, 1, 12, 1, "Guests"), Text("Dinner for " + @Plural($guests, "guest")), Row([Button("Help me plan", @ToAssistant("Help me plan dinner")), Button("Reset", @Reset($name, $guests), "outline")], 2)])
$name = "Ada"
$guests = 4
field = Input($name, "Name", "text", "Your name")
echo = Text("Hello " + $name + " — your table is ready.")`,
  },
  {
    id: 'chart', title: 'Data, at a glance', note: 'The same rows drive a bar, line, area or pie chart.',
    code: `root = Col([Title("Revenue this quarter", "lg"), SegmentedControl($kind, ["bar", "line", "area", "pie"]), Chart($kind, rows, "month", ["Revenue"], "currency", "USD")])
$kind = "bar"
rows = [{month: "Jan", Revenue: 8400}, {month: "Feb", Revenue: 12300}, {month: "Mar", Revenue: 10800}, {month: "Apr", Revenue: 16100}]`,
  },
  {
    id: 'table', title: 'Compare the options', note: 'Semantic tables keep comparisons easy to scan.',
    code: `root = Col([Title("Choose your plan", "lg"), Table(["Plan", "Seats", "Monthly"], [["Personal", 1, "$9"], ["Team", 10, "$49"], ["Studio", 25, "$99"]]), Caption("Illustrative pricing, not a live offer.")])`,
  },
  {
    id: 'form', title: 'A useful conversation starter', note: 'Form fields accompany the emitted assistant action.',
    code: `root = Col([Title("Your next weekend", "lg"), Form([Input($destination, "Destination"), Select($pace, ["Relaxed", "Packed"], "Pace"), Checkbox($outdoors, "Include the outdoors"), TextArea($notes, "Anything else?"), Button("Plan my trip", @ToAssistant("Plan my weekend trip"))])])
$destination = "Lisbon"
$pace = "Relaxed"
$outdoors = true
$notes = "Good coffee and a quiet walk"`,
  },
]
