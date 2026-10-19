// Generated from rules.yaml by deploy/build_web.py - do not edit.
window.RULES = {
 "version": "0.2",
 "dice": {
  "count": 3,
  "sides": 6
 },
 "categories": {
  "Physical": [
   "Strength",
   "Agility",
   "Dexterity"
  ],
  "Mental": [
   "Intelligence",
   "Education",
   "Resilience"
  ],
  "Emotional": [
   "Influence",
   "Empathy",
   "Courage"
  ],
  "Spiritual": [
   "Perception",
   "Insight",
   "Intuition"
  ]
 },
 "outcomes": [
  {
   "name": "Fail",
   "min": -999,
   "max": 12,
   "frame": "No, and...",
   "experience": 1
  },
  {
   "name": "Conditional",
   "min": 13,
   "max": 14,
   "frame": "Yes, but...",
   "experience": 0
  },
  {
   "name": "Good",
   "min": 15,
   "max": 19,
   "frame": "Yes...",
   "experience": 0
  },
  {
   "name": "Profound",
   "min": 20,
   "max": null,
   "frame": "Yes, and...",
   "experience": 1
  }
 ],
 "creation": {
  "talent_points": 15,
  "category_base_max": 2,
  "specific_talent_max": 3,
  "gifting_bonus": 3,
  "gifting_bonus_count": 3,
  "max_background_skills": 3,
  "goals": 1,
  "allegiances": 1,
  "flaws": 2,
  "inventory_slots": {
   "min": 0,
   "max": 16
  },
  "narrative_fields": [
   "Age",
   "Height",
   "Eye colour",
   "Hair colour",
   "Gender",
   "Occupation",
   "Distinguishing Features",
   "Character Description"
  ]
 },
 "stress": {
  "max": 20,
  "points_per_penalty": 4,
  "penalty": 1
 },
 "experience": {
  "points_per_bonus": 1
 },
 "modifiers": {
  "motivation_work": {
   "label": "Motivation Work",
   "value": 3,
   "stress": 1,
   "applies_to": "talent"
  },
  "gifting": {
   "label": "Gifting",
   "value": 3,
   "stress": 0,
   "applies_to": "gifting"
  },
  "background_skill": {
   "label": "Background Skill",
   "value": 2,
   "stress": 0,
   "applies_to": "talent"
  },
  "goal": {
   "label": "Goal",
   "value": 2,
   "stress": 0,
   "applies_to": "any"
  },
  "allegiance": {
   "label": "Allegiance",
   "value": 2,
   "stress": 0,
   "applies_to": "any"
  },
  "flaw": {
   "label": "Flaw",
   "value": -2,
   "stress": 0,
   "applies_to": "any",
   "flaw_extra_xp": 2
  }
 },
 "giftings": {
  "Wisdom": "Insight into old knowledge",
  "Knowledge": "New unknown knowledge",
  "Faith": "Conviction it will happen",
  "Healing": "Recovering any health loss",
  "Miracle": "Creative supernatural help",
  "Prophecy": "Knowledge about the future",
  "Discernment": "Know what is good or evil",
  "Tongues": "Speaking a new language",
  "Interpretation": "Understand a new language"
 },
 "defaults": {
  "name": "New Character",
  "calling": "Teaching",
  "motivation": "Caretaker",
  "narrative": {
   "Age": "30",
   "Height": "175cm",
   "Eye colour": "Brown",
   "Hair colour": "Brown",
   "Gender": "Unspecified",
   "Occupation": "Traveller",
   "Distinguishing Features": "A small scar on the left hand",
   "Character Description": "A quiet, thoughtful wanderer."
  },
  "category_bases": {
   "Physical": 0,
   "Mental": 0,
   "Emotional": 0,
   "Spiritual": 0
  },
  "talents": {
   "Strength": 2,
   "Agility": 1,
   "Dexterity": 1,
   "Intelligence": 2,
   "Education": 1,
   "Resilience": 1,
   "Influence": 2,
   "Empathy": 1,
   "Courage": 1,
   "Perception": 1,
   "Insight": 1,
   "Intuition": 1
  },
  "background_skills": [
   "Carpentry",
   "First aid",
   "Storytelling"
  ],
  "goal": "Find a place to belong",
  "allegiance": "A trusted friend - looks out for me",
  "flaws": [
   "Stubborn",
   "Overly trusting"
  ],
  "inventory": [
   "Worn Bible",
   "Pocket knife",
   "Water flask",
   "Journal"
  ]
 },
 "notes": {
  "Name": "What is your character called? Include a nickname if others use one.",
  "Calling": "Your Calling decides which three Giftings start at +3. Pick the one that best matches how your character serves others.",
  "Motivation": "What drives your character day to day? Its Work can give +3 to a talent roll, at the cost of +1 Stress in that category.",
  "Age": "Age in years. Consider how it shapes experience and outlook.",
  "Height": "Rough height, e.g. 175cm. Optional detail: build or posture.",
  "Eye colour": "Eye colour, or anything unusual about the eyes.",
  "Hair colour": "Hair colour and style.",
  "Gender": "How your character identifies.",
  "Occupation": "What does your character do for a living, or did before the story begins?",
  "Distinguishing Features": "Scars, tattoos, a limp, a voice - anything people remember on meeting them.",
  "Character Description": "A short paragraph: personality, manner and how others first see them.",
  "Talents": "Spend the full point pool across the 12 Specific Talents. Spread points to match your concept.",
  "Giftings": "Read-only. The three Giftings granted by your Calling start at +3 and are used only for non-talent actions.",
  "Background skills": "Up to 3 skills from your history. Each gives +2 to a talent roll where it clearly applies.",
  "Goal": "One thing your character wants. Gives +2 to rolls that relate to it.",
  "Allegiance": "Name another character and the bond. Gives +2 when you support them in a way that shows the bond.",
  "Flaws": "Two weaknesses. Each gives -2 to related rolls, but a Fail on a flawed roll earns +2 extra Experience.",
  "Inventory": "Up to 16 items. Give each a name and a point bonus; the bonus is added to a roll when you select the item."
 },
 "callings": {
  "Apostolic": [
   "Miracle",
   "Healing",
   "Wisdom"
  ],
  "Prophetic": [
   "Prophecy",
   "Discernment",
   "Faith"
  ],
  "Teaching": [
   "Wisdom",
   "Knowledge",
   "Interpretation"
  ],
  "Evangelistic": [
   "Tongues",
   "Interpretation",
   "Miracle"
  ],
  "Pastoral": [
   "Healing",
   "Faith",
   "Knowledge"
  ]
 },
 "calling_attribute_bonuses": {
  "Apostolic": {
   "specific_talents": [],
   "amount": 1
  },
  "Prophetic": {
   "category": "Spiritual",
   "amount": 1
  },
  "Teaching": {
   "category": "Mental",
   "amount": 1
  },
  "Evangelistic": {
   "category": "Emotional",
   "amount": 1
  },
  "Pastoral": {
   "category": "Physical",
   "amount": 1
  }
 },
 "motivations": {
  "Seer": {
   "works": {
    "Provoke": "Insight",
    "Hearken": "Intuition",
    "Surmise": "Perception",
    "Resist": "Courage"
   }
  },
  "Expert": {
   "works": {
    "Research": "Education",
    "Critique": "Intelligence",
    "Observe": "Perception",
    "Tenacity": "Resilience"
   }
  },
  "Influencer": {
   "works": {
    "Encourage": "Empathy",
    "Persuade": "Influence",
    "Intimidate": "Courage",
    "Perform": "Agility"
   }
  },
  "Caretaker": {
   "works": {
    "Force": "Strength",
    "Operate": "Dexterity",
    "Move": "Agility",
    "Persist": "Resilience"
   }
  },
  "Patron": {
   "works": {
    "Calculate": "Intelligence",
    "Negotiate": "Influence",
    "Assist": "Dexterity",
    "Utilise": "Education"
   }
  },
  "Counsellor": {
   "works": {
    "Quieten": "Resilience",
    "Resolve": "Insight",
    "Counsel": "Empathy",
    "Understand": "Intuition"
   }
  },
  "Leader": {
   "works": {
    "Charisma": "Influence",
    "Aptitude": "Dexterity",
    "Capacity": "Strength",
    "Comprehend": "Intuition"
   }
  }
 }
};
