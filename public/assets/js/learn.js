import { $, esc, initChrome } from './site.js';

initChrome({ active: 'learn' });

// [term, category, definition, how it shows up in the news]
const TERMS = [
  ['Artificial intelligence (AI)', 'Basics', 'Software that performs tasks that normally need human judgment, like understanding language, recognizing images or making predictions.', 'Used loosely in headlines for everything from chatbots to self-driving cars.'],
  ['Machine learning', 'Basics', 'The main way modern AI is built: instead of writing rules by hand, you show a program lots of examples and it learns the patterns.', 'Your email spam filter and Netflix recommendations are machine learning.'],
  ['Neural network', 'Basics', 'A kind of machine-learning model loosely inspired by the brain: layers of simple math units that pass numbers to each other and adjust as they learn.', 'Almost every AI model in the news today is a neural network.'],
  ['Generative AI', 'Basics', 'AI that creates new content, such as text, images, audio, video or code, rather than only sorting or scoring existing data.', 'ChatGPT, Claude, Gemini, Midjourney and Sora are all generative AI.'],
  ['Large language model (LLM)', 'Models', 'A very large neural network trained on huge amounts of text to predict the next word. That simple goal turns out to produce systems that can write, summarize, reason and code.', 'GPT, Claude, Gemini and Llama are families of LLMs.'],
  ['Foundation model', 'Models', 'A big general-purpose model that other products are built on top of, the way apps are built on an operating system.', '“Frontier labs” compete to build the most capable foundation models.'],
  ['Frontier model', 'Models', 'The most capable AI models available at a given moment, usually from a handful of well-funded labs.', 'New frontier model launches tend to move markets and set off competitor releases.'],
  ['Multimodal', 'Models', 'A model that can take in or produce more than one kind of data, such as text plus images, audio or video.', 'A multimodal assistant can read a photo of a receipt and answer questions about it.'],
  ['Reasoning model', 'Models', 'A model designed to “think” through a problem step by step before answering, which usually makes it better at math, code and planning, but slower and pricier.', 'Labs often advertise reasoning models by their scores on hard math and coding tests.'],
  ['Open-weight model', 'Models', 'A model whose trained parameters (weights) are published so anyone can download and run it themselves. Different from fully open source, which also shares training data and code.', 'Meta’s Llama, Mistral and DeepSeek have released open-weight models.'],
  ['Parameters', 'Models', 'The adjustable numbers inside a model that get tuned during training. More parameters roughly means more capacity, and more cost to run.', '“A 70-billion-parameter model” describes its size.'],
  ['Tokens', 'Models', 'The chunks of text a model reads and writes, roughly three-quarters of a word each. AI companies price their services per token.', '“$3 per million tokens” is a typical way API prices are quoted.'],
  ['Context window', 'Models', 'How much text (measured in tokens) a model can consider at once, including your question, any documents you give it, and its answer.', 'A bigger context window lets a model read an entire contract or codebase in one go.'],
  ['Hallucination', 'Models', 'When an AI confidently states something false or made up.', 'The reason AI-written answers should be checked before they are trusted.'],
  ['Benchmark', 'Models', 'A standard test used to compare AI models, such as a set of math problems, coding tasks or exam questions.', 'Launch announcements usually lead with benchmark scores. Treat them as a rough guide, not the whole story.'],
  ['Training', 'Building AI', 'The expensive, one-time process of teaching a model by feeding it data and adjusting its parameters, often using thousands of chips for weeks or months.', 'Training runs for top models now cost hundreds of millions of dollars.'],
  ['Inference', 'Building AI', 'Running a trained model to get an answer. Every time you chat with an AI, that is inference.', 'As usage grows, inference, not training, becomes most of the computing bill.'],
  ['Fine-tuning', 'Building AI', 'Taking an existing model and training it a bit more on specialized data so it gets better at a specific job or style.', 'A law firm might fine-tune a model on its own documents.'],
  ['RAG (retrieval-augmented generation)', 'Building AI', 'A technique where the AI first looks up relevant documents, like your company’s files, and then answers using them. It cuts down on made-up answers.', 'Most “chat with your documents” tools use RAG.'],
  ['Prompt', 'Building AI', 'The instructions or question you give an AI. How you phrase it can change the quality of the answer a lot.', '“Prompt engineering” is the craft of writing prompts that work reliably.'],
  ['AI agent', 'Building AI', 'An AI system that doesn’t just answer but takes actions to complete a goal: browsing, filling in forms, writing and running code, or using other software.', 'Agents that book appointments or reconcile invoices are a big focus for businesses.'],
  ['API', 'Building AI', 'A way for software to talk to other software. AI companies sell access to their models through APIs so other apps can build on them.', 'Startups often build products on top of OpenAI, Anthropic or Google APIs.'],
  ['GPU', 'Hardware & energy', 'Graphics processing unit: a chip originally made for video games that turns out to be ideal for the math AI needs. Nvidia dominates the market.', 'GPU supply is a major bottleneck, and a major driver of Nvidia’s stock.'],
  ['AI accelerator', 'Hardware & energy', 'Any chip built to speed up AI work, including GPUs and custom chips like Google’s TPUs or Amazon’s Trainium.', 'Big tech companies design their own accelerators to reduce reliance on Nvidia.'],
  ['Data center', 'Hardware & energy', 'A building full of servers. AI data centers pack in huge numbers of power-hungry chips and need serious cooling and electricity.', 'Data center construction is behind much of the AI spending boom.'],
  ['Compute', 'Hardware & energy', 'Shorthand for computing power: the chips, servers and energy needed to train and run AI.', '“Access to compute” often decides which labs can compete.'],
  ['Hyperscaler', 'Business & markets', 'The giant cloud providers (Amazon Web Services, Microsoft Azure, Google Cloud, and often Meta and Oracle) that spend the most on AI infrastructure.', 'Hyperscaler capital spending plans are closely watched by investors.'],
  ['Capex', 'Business & markets', 'Capital expenditure: money a company spends on long-lasting assets like data centers and chips.', '“AI capex” is one of the most-cited numbers in tech earnings calls.'],
  ['AI bubble', 'Business & markets', 'The debate over whether AI company valuations and spending have run ahead of the revenue AI actually produces.', 'Comes up whenever AI stocks swing sharply.'],
  ['Copilot', 'Business & markets', 'An AI assistant built into software you already use, helping you write, code or analyze as you work. Also Microsoft’s brand name for its AI assistants.', 'Many business software makers now charge extra for copilot features.'],
  ['Automation', 'Business & markets', 'Using software, increasingly AI, to do tasks that people used to do by hand.', 'Central to debates about AI’s effect on jobs and small-business productivity.'],
  ['AGI', 'Policy & safety', 'Artificial general intelligence: a hypothetical AI that could do most intellectual work as well as a person. There is no agreed definition or date.', 'Lab leaders often talk about AGI timelines. Treat predictions with caution.'],
  ['Alignment', 'Policy & safety', 'Research into making AI systems reliably do what their designers and users intend, and avoid harmful behavior.', 'Labs publish alignment and safety research alongside new models.'],
  ['EU AI Act', 'Policy & safety', 'The European Union’s law regulating AI by risk level, with stricter rules for high-risk uses and obligations for makers of general-purpose models.', 'Any company offering AI to people in the EU has to follow it.'],
  ['Export controls', 'Policy & safety', 'Government limits on selling advanced chips and technology to certain countries.', 'US rules on AI chip sales to China affect Nvidia, AMD and others.'],
  ['Deepfake', 'Policy & safety', 'Realistic fake audio, images or video of real people, made with AI.', 'A growing focus of election and fraud laws.'],
];

const CATS = ['All', ...new Set(TERMS.map((t) => t[1]))];
let cat = 'All';
let filter = '';

function render() {
  const f = filter.toLowerCase();
  const list = TERMS.filter((t) => (cat === 'All' || t[1] === cat) && (!f || `${t[0]} ${t[2]}`.toLowerCase().includes(f)));
  $('#gloss').innerHTML = list.length
    ? list
        .map(
          ([term, c, def, eg]) => `<article class="term" id="${term.toLowerCase().replace(/[^a-z0-9]+/g, '-')}"><span class="chip" data-sec="research">${esc(c)}</span><h3 style="margin-top:8px">${esc(term)}</h3><p>${esc(def)}</p><p class="eg"><strong>In the news:</strong> ${esc(eg)}</p></article>`,
        )
        .join('')
    : '<div class="empty" style="grid-column:1/-1">No terms match. Try another word.</div>';
  $('#gloss-tabs').innerHTML = CATS.map((c) => `<button aria-selected="${c === cat}" data-c="${esc(c)}">${esc(c)}</button>`).join('');
}
$('#gloss-tabs').onclick = (e) => {
  const b = e.target.closest('button');
  if (b) {
    cat = b.dataset.c;
    render();
  }
};
$('#gloss-filter').oninput = (e) => {
  filter = e.target.value;
  render();
};
render();
