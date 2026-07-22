// Generates reference materials, activities, games and videos for a topic.

// External reference links (safe, general search entry-points parents already trust).
export function referenceLinks(topic) {
  const q = encodeURIComponent(topic.name + ' for kids ' + topic.subject);
  const links = [
    { label: 'Khan Academy', icon: 'graduation-cap', url: `https://www.khanacademy.org/search?page_search_query=${encodeURIComponent(topic.name)}` },
    { label: 'BBC Bitesize', icon: 'newspaper', url: `https://www.bbc.co.uk/bitesize/search?q=${encodeURIComponent(topic.name)}` },
    { label: 'Wikipedia', icon: 'library', url: `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(topic.name)}` },
  ];
  return links;
}

export function videoLinks(topic) {
  const base = topic.name + ' ' + topic.subject + ' for kids';
  return [
    { label: 'Kid-safe video search', icon: 'youtube', url: `https://www.youtube.com/results?search_query=${encodeURIComponent(base + ' explained')}` },
    { label: 'Lesson videos', icon: 'play-circle', url: `https://www.youtube.com/results?search_query=${encodeURIComponent(topic.name + ' lesson elementary')}` },
  ];
}

// Deterministic hands-on activity + game ideas so every topic always has something,
// even offline. Chosen from templates by subject + topic type.
const ACTIVITY_TEMPLATES = {
  Mathematics: [
    { icon: 'dices', title: 'Kitchen counter math', body: 'Use coins, buttons or dried pasta to physically model the idea, then say the answer aloud before writing it.' },
    { icon: 'ruler', title: 'Real-world hunt', body: 'Find three examples of this concept around the house and photograph or draw them in a math journal.' },
    { icon: 'target', title: 'Beat-your-best drill', body: 'Set a 2-minute timer and see how many problems can be solved correctly. Record the score to beat next time.' },
  ],
  English: [
    { icon: 'pen-line', title: 'Story of the day', body: 'Write or dictate 3–4 sentences using today\u2019s skill. Read it back aloud with expression.' },
    { icon: 'mic', title: 'Read & record', body: 'Record the child reading a short passage. Play it back together and celebrate one thing done well.' },
    { icon: 'search', title: 'Word detective', body: 'Hunt through a favorite book for five examples of this concept and list them.' },
  ],
  Science: [
    { icon: 'flask-conical', title: 'Home experiment', body: 'Design a simple test at home. Predict what will happen first, then observe and compare.' },
    { icon: 'notebook-pen', title: 'Observation journal', body: 'Draw a labeled diagram of what was observed and write one sentence explaining why it happens.' },
    { icon: 'trees', title: 'Nature walk', body: 'Go outside and find a real example of this concept. Photograph it and discuss what is happening.' },
  ],
  History: [
    { icon: 'scroll', title: 'Time detective', body: 'Find one artifact, image or story from this period and explain what it tells us about the people.' },
    { icon: 'clapperboard', title: 'Act it out', body: 'Role-play a scene from this time. What would daily life have felt like?' },
    { icon: 'map', title: 'Then & now', body: 'Draw a picture showing how something from this period compares with life today.' },
  ],
  default: [
    { icon: 'lightbulb', title: 'Explain it back', body: 'Ask the child to teach this idea back to you as if you had never heard it. Gaps reveal what to revisit.' },
    { icon: 'puzzle', title: 'Real-life link', body: 'Spot this concept during everyday routines this week and point it out together.' },
    { icon: 'palette', title: 'Draw to learn', body: 'Sketch a picture or diagram that captures the main idea in the child\u2019s own way.' },
  ],
};

const GAME_TEMPLATES = {
  Mathematics: [
    { icon: 'gamepad-2', title: 'Roll & solve', body: 'Roll two dice and use the numbers to make a problem. First to answer correctly wins the round.' },
    { icon: 'grid-3x3', title: 'Bingo board', body: 'Make a 3\u00d73 grid of answers. Call out problems; cover the matching answer. Three in a row wins.' },
  ],
  English: [
    { icon: 'gamepad-2', title: 'Word ladder', body: 'Change one letter at a time to make new words. Longest chain wins.' },
    { icon: 'shuffle', title: 'Sentence scramble', body: 'Write a sentence on cards, shuffle it, and race to put it back in order.' },
  ],
  Science: [
    { icon: 'gamepad-2', title: 'True or false sprint', body: 'Fire quick statements about the topic; jump for true, sit for false.' },
    { icon: 'layers', title: 'Sorting race', body: 'Sort a pile of picture cards into the right categories against the clock.' },
  ],
  default: [
    { icon: 'gamepad-2', title: 'Quiz duel', body: 'Take turns asking each other questions about the topic. A point for every correct answer.' },
    { icon: 'timer', title: 'Beat the clock', body: 'How many examples can be named in 60 seconds? Try to beat the record each day.' },
  ],
};

export function activityIdeas(topic) {
  return ACTIVITY_TEMPLATES[topic.subject] || ACTIVITY_TEMPLATES.default;
}
export function gameIdeas(topic) {
  return GAME_TEMPLATES[topic.subject] || GAME_TEMPLATES.default;
}
