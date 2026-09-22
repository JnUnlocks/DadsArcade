/**
 * Phrase banks for Black Disc.
 *
 * Kept as plain word/phrase lists rather than anything cleverer: the whole
 * game is "read this out loud without saying it", so a category is just a
 * themed bag of things a family can describe to each other.
 */

export interface DiscCategory {
  readonly id: string;
  readonly label: string;
  readonly emoji: string;
  readonly hint: string;
  readonly words: readonly string[];
}

export const CATEGORIES: readonly DiscCategory[] = [
  {
    id: "everyday",
    label: "Everyday Life",
    emoji: "🍕",
    hint: "Food, fun & familiar things",
    words: [
      "Pizza delivery", "Toothbrush", "Pillow fight", "Birthday cake", "School bus",
      "Ice cream cone", "Hide and seek", "Roller coaster", "Peanut butter", "Bubble bath",
      "Snow day", "Jump rope", "Popcorn", "Washing machine", "Alarm clock",
      "Swimming pool", "Hot chocolate", "Water balloon", "Board game", "French fries",
      "Camping tent", "Skateboard", "Sunglasses", "Library", "Bicycle",
      "Grocery cart", "Fire truck", "Backpack", "Teddy bear", "Lemonade stand",
      "Trampoline", "Sleeping bag", "Bowling", "Sandcastle", "Flashlight",
      "Pancakes", "Kite", "Rain boots", "Treasure hunt", "Bouncy castle",
      "Spaghetti", "Remote control", "Soccer ball", "Rock paper scissors", "Guitar",
      "Taco Tuesday", "Traffic light", "Snowman", "Birthday candles", "Pajamas",
      "Picnic basket", "Hula hoop", "Movie theater", "Cookie jar", "Monkey bars",
      "Treehouse", "Magic trick", "Water slide", "Video game", "Umbrella",
    ],
  },
  {
    id: "nature",
    label: "Animals & Nature",
    emoji: "🦁",
    hint: "Wild things & the great outdoors",
    words: [
      "Giraffe", "Penguin", "Dolphin", "Rainbow", "Volcano",
      "Butterfly", "Thunderstorm", "Polar bear", "Waterfall", "Octopus",
      "Ladybug", "Mountain lion", "Sea turtle", "Shooting star", "Elephant",
      "Jellyfish", "Sunflower", "Kangaroo", "Campfire", "Crocodile",
      "Cactus", "Woodpecker", "Snowflake", "Hummingbird", "Rattlesnake",
      "Tornado", "Golden retriever", "Hermit crab", "Praying mantis", "Bald eagle",
      "Pine cone", "Raccoon", "Hedgehog", "Great white shark", "Full moon",
      "Firefly", "Hippopotamus", "Coral reef", "Bumblebee", "Ostrich",
      "Earthworm", "Seahorse", "Maple tree", "Chameleon", "Red fox",
      "Flamingo", "Caterpillar", "Gorilla", "Rainforest", "Starfish",
      "Peacock", "Beaver dam", "Spider web", "Lion cub", "Tide pool",
      "Desert", "Orca", "Squirrel", "Clownfish", "Owl",
    ],
  },
  {
    id: "movies",
    label: "Movies & Characters",
    emoji: "🎬",
    hint: "Family favorites & famous faces",
    words: [
      "Mickey Mouse", "Frozen", "Spider-Man", "Toy Story", "SpongeBob SquarePants",
      "Finding Nemo", "The Lion King", "Stitch", "Batman", "Cinderella",
      "Shrek", "Moana", "Darth Vader", "Bluey", "Super Mario",
      "Winnie the Pooh", "Scooby-Doo", "Elsa", "Buzz Lightyear", "Rapunzel",
      "Minions", "Harry Potter", "The Grinch", "Captain America", "Sonic the Hedgehog",
      "Lightning McQueen", "Pikachu", "Kung Fu Panda", "The Little Mermaid", "Iron Man",
      "Olaf", "Aladdin", "Wonder Woman", "Dory", "Paddington Bear",
      "Peter Pan", "Donald Duck", "Ratatouille", "Encanto", "Maui",
      "Snow White", "The Incredibles", "Yoda", "Mary Poppins", "Dumbo",
      "Chewbacca", "WALL-E", "Willy Wonka", "Ninja Turtles", "Bugs Bunny",
      "Inside Out", "The Hulk", "Mufasa", "Tinker Bell", "Woody",
      "Princess Peach", "Jurassic Park", "Coco", "Paw Patrol", "Beauty and the Beast",
    ],
  },
  {
    id: "arcade",
    label: "Arcade Nights",
    emoji: "🕹️",
    hint: "Straight out of Dad's Arcade",
    words: [
      "High score", "Rescue the good boy", "Slime Shop", "Wrench power", "D-pad",
      "Prize jar", "Junk-throwing robot", "Mallard Challenge", "Jellyfish dodge", "Frog crossing",
      "Tetris block", "Extra life", "Game over", "Insert coin", "Pause button",
      "Cabinet art", "Level up", "Personal best", "Leaderboard", "Boss fight",
      "Power-up", "Shotgun blast", "Squish the slime", "Tower climb", "Starfighter",
      "Capture beam", "Four lines at once", "Daily challenge", "Confetti", "Buzzer",
      "First to seven", "Black disc", "Pass the phone", "Rule break", "Loading bar",
      "Ticking clock", "Two truths and a lie", "Family game night", "Screen time", "Team huddle",
    ],
  },
  {
    id: "bible",
    label: "Bible Stories",
    emoji: "📖",
    hint: "Stories, people & places from Scripture",
    words: [
      "Noah's Ark", "David and Goliath", "The Ten Commandments", "The Garden of Eden", "Adam and Eve",
      "The Last Supper", "Jonah and the Whale", "The Good Samaritan", "Moses", "The Burning Bush",
      "The Nativity", "The Three Wise Men", "The Promised Land", "Noah's Rainbow", "The Prodigal Son",
      "Walking on Water", "Parting the Red Sea", "The Crucifixion", "The Resurrection", "Palm Sunday",
      "The Tower of Babel", "Samson and Delilah", "The Ark of the Covenant", "Mary and Joseph", "The Star of Bethlehem",
      "Loaves and Fishes", "Daniel and the Lion's Den", "The Good Shepherd", "The Sermon on the Mount", "Turning Water into Wine",
      "The Ten Plagues", "Cain and Abel", "The Golden Rule", "Jacob's Ladder", "The Shepherds and the Angels",
      "Doubting Thomas", "The Widow's Mite", "Zacchaeus in the Tree", "The Empty Tomb", "John the Baptist",
      "The Wedding at Cana", "Solomon's Wisdom", "The Fiery Furnace", "Elijah's Chariot", "The Baptism of Jesus",
      "The Twelve Disciples", "Peter's Denial", "The Crown of Thorns", "The Angel Gabriel", "The Manger",
      "The Walls of Jericho", "Noah's Dove", "Fishers of Men", "The Mustard Seed", "Ruth and Naomi",
      "The Lord's Prayer",
    ],
  },
  {
    id: "holidays",
    label: "Holidays & Celebrations",
    emoji: "🎉",
    hint: "Celebrations all year round",
    words: [
      "Christmas morning", "Halloween costume", "Trick-or-treating", "Thanksgiving dinner", "Fourth of July fireworks",
      "Easter egg hunt", "New Year's Eve", "Birthday party", "Valentine's Day", "Santa Claus",
      "The Easter Bunny", "Christmas tree", "Jack-o'-lantern", "Turkey dinner", "Family reunion",
      "Graduation day", "Wedding day", "Baby shower", "Christmas stocking", "Gift wrapping",
      "Birthday cake", "Balloon animals", "Parade", "Confetti", "Camping trip",
      "Road trip", "Snow day", "Summer vacation", "Labor Day cookout", "Memorial Day",
      "St. Patrick's Day", "Mother's Day", "Father's Day", "Groundhog Day", "April Fools' joke",
      "Halloween candy", "Advent calendar", "Christmas carols", "New Year's resolution", "Countdown to midnight",
      "Ugly Christmas sweater", "Trick-or-treat bag", "Pumpkin carving", "Hot air balloon festival", "County fair",
      "Block party", "Anniversary", "Surprise party", "Piñata", "Scavenger hunt",
      "Sparklers", "Fireworks show", "Cookout", "Family photo", "Costume contest",
      "Holiday lights",
    ],
  },
];
