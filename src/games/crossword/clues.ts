/**
 * The crossword's clue bank: every word a puzzle can contain, and its clue.
 *
 * Written by hand for this arcade, the way Letter Lock's answers were. The bar
 * is a family solving together: a child can get most of them with a little
 * help, and a grown-up doesn't feel talked down to. No swears, nothing rude,
 * nothing about fighting, drinking or smoking, and no word so obscure that the
 * only way to it is the crossing letters -- in this style of grid half the
 * letters have no crossing at all, so every word has to be gettable from its
 * clue. Words that British and American English spell differently are left
 * out, and so is the word "colour" from every clue.
 *
 * The puzzle generator (generate.ts) fills its grids from this list alone, so
 * the list is also what decides whether a grid can be filled. Variety matters
 * more than size: a new word with an unusual letter in an unusual place opens
 * more grids than ten that end in -ING.
 *
 * Changing this list changes every future day's puzzle, as it does for Letter
 * Lock's word. That's fine between releases; a puzzle already started is saved
 * whole (progress.ts), so nobody's grid changes under them.
 *
 * One entry per line: `word|clue`, or `word|clue|another clue` where a word is
 * common enough that seeing the same clue every week would get old.
 * clues.test.ts checks the shape of every line.
 */

const BANK = `
ace|Top card in the deck
act|Part of a play
add|Put numbers together
age|How old you are
aim|Point at the target
air|You breathe it
ant|Tiny picnic visitor
ape|Gorilla or chimp
arc|Part of a circle
ark|Noah's boat
arm|It bends at the elbow
art|Paintings and drawings
ask|Pose a question
ate|Had dinner
bag|Shopping carrier
bat|It flies at night|Baseball stick
bay|Sheltered bit of sea
bed|Where you sleep
bee|Honey maker
bib|Baby's mealtime cover
big|Not small
bit|Small piece
bow|Ribbon on a present
box|Cardboard container
boy|Young lad
bud|Flower to be
bug|Insect
bun|Burger holder
bus|School ride
cab|Taxi
can|Tin container
cap|Baseball hat
car|It has four wheels
cat|Pet that purrs
cow|Farm animal that moos
cry|Shed tears
cub|Baby bear
cup|Tea holder
cut|Use scissors
dad|Father
day|Monday or Tuesday
den|Lion's home
dew|Morning drops on the grass
dig|Use a shovel
dip|Quick swim
dog|Pet that barks
dot|Tiny round mark
dry|Not wet
ear|You hear with it
eat|Have a meal
eel|Slippery fish
egg|A hen lays it
elf|Santa's helper
elk|Large deer
elm|Shady tree
end|Finish
era|Long stretch of history
eve|Night before
eye|You see with it
fan|It keeps you cool
far|Not near
few|Not many
fig|Small sweet fruit
fin|Shark's steering part
fir|Christmas tree type
fix|Mend
fly|Travel by plane|Buzzing pest
fog|Thick mist
fox|Sly animal with a bushy tail
fun|A good time
fur|Bear's coat
gap|Space between
gem|Ruby or emerald
gum|You chew it
hat|It sits on your head
hay|Horse food
hen|Mother chicken
hop|Jump like a bunny
hot|Not cold
hug|Warm squeeze
hum|Sing with your lips closed
hut|Small simple house
ice|Frozen water
ink|Pen filler
inn|Small hotel
ivy|Climbing plant
jam|Toast spread
jar|Glass container with a lid
jaw|It moves when you chew
jet|Fast plane
jig|Lively dance
jog|Run slowly
joy|Great happiness
key|It opens a lock
kid|Child, or a baby goat
kit|Set of tools
lab|Science room
lap|Once around the track
leg|The knee is part of it
lid|Top of a jar
lip|Edge of a cup
log|Fireplace wood
low|Not high
map|It shows the way
mat|It says WELCOME at the door
mix|Stir together
mop|Floor cleaner
mud|Wet dirt
mug|Hot chocolate holder
nap|Short sleep
net|Back of a goal
new|Not old
nod|Say yes with your head
nut|Squirrel's snack
oak|Acorn tree
oar|Rowboat paddle
oat|Porridge grain
odd|Not even
oil|It goes in a frying pan
old|Not young
one|Number before two
owl|Bird that hoots
pal|Buddy
pan|It fries an egg
paw|Dog's foot
pea|Small green vegetable
pen|It writes in ink
pet|Animal friend at home
pie|Dessert with a crust
pig|Animal that oinks
pin|Sharp fastener
pod|Pea's home
pop|Balloon sound
pot|Soup cooker
pup|Young dog
ram|Male sheep
rat|Rodent bigger than a mouse
raw|Not cooked
ray|Beam of sunlight
red|Stop sign shade
rib|Chest bone
rip|Tear
rod|Fishing pole
row|Use oars
rug|Small carpet
run|Go fast on foot
sad|Unhappy
saw|Tool that cuts wood
sea|Ocean
see|Use your eyes
shy|Bashful
sip|Small drink
sit|Take a chair
six|Half a dozen
ski|Glide down a snowy slope
sky|Where clouds float
son|Boy child
spy|Secret agent
sum|Total
sun|Our nearest star
tag|Playground chasing game
tap|Light knock
tea|Drink made with leaves
ten|Number of toes
tie|Even score|It goes with a shirt
tin|Metal can
toe|Foot digit
top|Spinning toy
toy|Plaything
tub|Bath spot
tug|Pull hard
two|A pair
use|Put to work
van|Delivery vehicle
vet|Animal doctor
wag|What a happy tail does
wax|Candle stuff
web|Spider's home
wet|Soaked
wig|Fake hair
win|Come first
yak|Shaggy ox
yam|Sweet potato
yes|Opposite of no
zip|Jacket fastener
zoo|Place to see lions and zebras
able|Having the skill
acre|Farm field measure
aged|Got older
also|As well
area|Length times width
arch|Curved doorway top
atom|Tiny bit of matter
aunt|Mother's sister
away|Not at home
axis|The Earth spins on it
baby|Newborn
back|Opposite of front
bake|Cook in the oven
ball|It bounces
band|Group of musicians
bank|Place for savings
barn|Farm building
bath|Tub time
bead|Necklace piece
beak|Bird's bill
bean|Chili ingredient
bear|Grizzly or polar
beef|Meat in a burger
bell|It rings
belt|It holds up trousers
bike|Two-wheeled ride
bird|Robin or sparrow
blue|Shade of a clear sky
boat|It floats
bold|Brave
bone|Dog's treat
book|It has pages
boot|Rainy day footwear
bowl|Cereal holder
bulb|Light ___
bush|Small shrub
cage|Hamster's home
cake|Birthday treat
calf|Baby cow
calm|Peaceful
camp|Sleep in a tent
cape|Superhero's cloak
card|Birthday greeting
cart|Shopping trolley
cave|Bear's winter home
chef|Restaurant cook
chin|It's below your mouth
city|Big town
clap|Applaud
claw|Cat's sharp nail
clay|Potter's material
clue|Hint
coal|Black rock that burns
coat|Winter wear
coin|Penny or dime
cold|Chilly
comb|Hair tidier
cook|Make dinner
cool|A bit cold
corn|It grows on a cob
cozy|Snug and warm
crab|Sideways walker on the beach
crow|Black bird
cube|Shape of a die
cute|Adorable
dark|Without light
dart|Small arrow for a board
dawn|Sunrise
deck|Pack of cards
deep|Far down
deer|Bambi, for one
desk|School table
dice|Board game cubes
dime|Ten cents
dish|Plate
dive|Jump into the pool head first
dock|Where boats tie up
doll|Toy baby
door|Way into a room
dove|Bird of peace
down|Opposite of up
drum|You beat it with sticks
duck|Bird that quacks
dune|Hill of sand
dusk|Sunset time
dust|It gathers on shelves
each|Every one
earn|Get paid for work
east|Where the sun rises
easy|Not hard
echo|Sound that bounces back
edge|Rim
envy|Jealousy
even|Two, four or six
exit|Way out
face|Front of a clock
fair|Just and right
fall|Autumn
farm|Where crops grow
fast|Quick
fern|Leafy forest plant
fire|It needs wood and a match
fish|Trout or salmon
five|Fingers on one hand
flag|It flies on a pole
flat|Level
flip|Turn a pancake
foal|Baby horse
foam|Bubbles on a wave
fold|Crease paper
food|What we eat
foot|Twelve inches
fork|Dinner tool with prongs
four|Sides on a square
frog|Pond hopper
fuel|What an engine burns
full|No room left
game|Chess or checkers
gate|Garden entrance
gift|Present
girl|Young lass
glad|Pleased
glow|Shine softly
glue|Sticky stuff
goal|Soccer score
goat|Animal with a beard and horns
gold|Pirate's treasure metal
golf|Game with clubs and tees
good|Not bad
gown|Fancy dress
grab|Snatch
gray|Elephant shade
grin|Wide smile
grow|Get bigger
gulf|Large bay
gust|Sudden wind
hail|Icy rain
hair|A barber cuts it
half|Fifty percent
hall|Long corridor
hand|It has five fingers
hare|Tortoise's rival
harp|Angel's instrument
hawk|Sharp-eyed bird of prey
heat|Warmth
help|Lend a hand
herd|Group of cattle
hero|Brave person
hide|___ and seek
high|Way up
hike|Long walk in the hills
hill|Small mountain
hint|Small clue
hive|Bees' home
hold|Keep in your hand
hole|Golf target
home|Where the heart is
hood|Top of a parka
hoof|Horse's foot
hook|Fishing line end
hoop|Basketball ring
hope|Wish for the best
horn|It beeps in a car
hose|Garden waterer
hour|Sixty minutes
huge|Giant
hush|Be quiet
idea|Bright thought
inch|Twelfth of a foot
iris|Part of the eye, or a flower
iron|It smooths shirts
isle|Small island
item|Thing on a list
jazz|Music with saxophones
jeep|Bumpy road vehicle
joke|It gets a laugh
jump|Leap
june|Month before July
junk|Stuff for the tip
keen|Eager
kelp|Seaweed
kick|Strike a ball with a foot
kind|Caring
king|Chess piece to protect
kite|It flies on a string
kiwi|Fuzzy green fruit
knee|Middle of the leg
knit|Make a scarf with needles
knob|Door handle
knot|Tied shoelace
lace|Shoe string
lake|Water with land all around
lamb|Baby sheep
lamp|Bedside light
land|Touch down in a plane
lane|Narrow road
lark|Early morning songbird
last|At the end
late|Not on time
lava|Hot stuff from a volcano
lawn|Grass to mow
lazy|Not keen on work
leaf|It falls in autumn
left|Opposite of right
lens|Camera glass
life|Board game with a spinner
lift|Raise
lime|Sour green fruit
line|Queue
lion|King of the jungle
list|Things to buy, written down
loaf|Whole bread
lock|A key opens it
long|Not short
loop|Circle in a rope
loud|Noisy
luck|Four-leaf clover brings it
lung|Breathing organ
mail|Letters and parcels
main|Most important
mane|Lion's hair
many|A lot
mask|Halloween face cover
maze|Puzzle of paths
meal|Lunch or dinner
melt|What ice does in the sun
menu|List of dishes
mild|Not spicy
mile|Long distance to run
milk|Cow's drink
mint|Fresh breath flavor
mist|Light fog
mole|Tunnel digger in the lawn
moon|It lights the night
moss|Soft green growth on rocks
moth|Night flier drawn to light
mule|Stubborn animal
myth|Old story of gods and heroes
nail|Hammer's target
name|What you're called
navy|Dark blue
neat|Tidy
neck|Giraffe's long part
nest|Bird's home
news|Paper's contents
nice|Pleasant
nine|Three times three
noon|Midday
nose|You smell with it
note|Short message
oboe|Woodwind with a reed
once|One time
only|Just
open|Not shut
oval|Egg shape
oven|Cake baker
pace|Walking speed
pack|Fill a suitcase
page|Leaf of a book
pail|Bucket
pair|Two socks
palm|Tree on a tropical beach
park|Place with swings
path|Trail
pawn|Smallest chess piece
peak|Mountain top
pear|Fruit shaped like a light bulb
peel|Banana skin
pier|Walkway over the sea
pile|Heap
pine|Tree with cones
pink|Flamingo shade
pipe|Plumber's tube
plan|Idea for later
play|Have fun
plum|Purple fruit
poem|Verse that may rhyme
pole|North or South ___
pond|Duck's swimming spot
pony|Small horse
pool|Swimming spot
port|Harbor
puff|Small cloud
pull|Opposite of push
pump|It fills a tire
quiz|Short test
race|Contest of speed
raft|Flat boat of logs
rain|Umbrella weather
rake|Leaf gatherer
reef|Coral ridge
rest|Take a break
rice|Tiny white grain
ride|Go on a horse
ring|It goes on a finger
ripe|Ready to eat
road|Cars drive on it
roar|Lion's sound
robe|Bath wrap
rock|Stone
roof|Top of a house
room|Kitchen or bedroom
root|Underground part of a plant
rope|Cowboy's lasso
rose|Flower with thorns
ruby|Red gem
rule|Thing to follow
safe|Out of danger
sail|Wind catcher on a boat
salt|Pepper's partner
sand|Beach stuff
scar|Mark from an old cut
seal|Flippered animal that barks
seat|Chair
seed|Plant starter
ship|Ocean liner
shoe|It goes over a sock
shop|Store
sign|Road marker
silk|Smooth fabric from worms
sing|Use your voice in a choir
sink|Where dishes get washed
size|Small, medium or large
skip|Hop along
slow|Like a snail
snow|White winter flakes
soap|Bar by the sink
sock|It goes on a foot
sofa|Couch
soft|Like a pillow
soil|Garden dirt
song|Tune with words
soup|It comes in a bowl
star|Night sky twinkler
stem|Flower stalk
step|Stair
stew|Slow-cooked dinner
swan|Graceful white bird
swim|Do the backstroke
tail|What a dog wags
tale|Story
tall|Like a giraffe
team|Group of players
tent|Camping shelter
tide|Sea's rise and fall
tile|Bathroom floor square
time|A clock tells it
tiny|Very small
toad|Warty hopper
tree|Oak or maple
trip|Journey
tuba|Big brass instrument
tuna|Fish in a sandwich
tune|Melody
twig|Small branch
twin|One of two born together
ugly|Like the duckling in the story
unit|Inch or mile
vase|Flower holder
vest|Sleeveless top
view|Scene from a window
vine|Grape plant
vote|Have your say on election day
wage|Pay
wall|Side of a room
wand|Wizard's stick
warm|Between hot and cold
wasp|Striped stinger
wave|Surfer's ride
weed|Garden pest plant
week|Seven days
well|Deep hole for water
west|Where the sun sets
whale|Biggest animal in the sea
wide|Not narrow
wind|It moves a sailboat
wing|Bird's flapper
wink|Close one eye
wish|Hope made on a star
wolf|Animal that howls at the moon
wood|What a carpenter saws
wool|Sheep's coat
worm|Early bird's catch
yard|Three feet
yarn|Knitting thread
yawn|Sleepy mouth stretch
year|Twelve months
yoga|Stretchy exercise
yolk|Yellow of an egg
zero|Nothing
zone|Area
zoom|Move very fast
about|Roughly
acorn|Oak seed
actor|Stage or film performer
adult|Grown-up
agree|Think the same
alarm|It wakes you up
album|Book of photos
alien|Visitor from another planet
alley|Narrow back street
alone|By yourself
amber|Middle traffic light
angel|Figure with wings and a halo
angle|Corner of a triangle
ankle|Joint above the foot
apple|Fruit that keeps the doctor away
april|Month of showers
apron|Cook's cover
arrow|Archer's shot
atlas|Book of maps
attic|Room under the roof
awake|Not asleep
award|Prize
bacon|Breakfast strips
badge|Sheriff's star
bagel|Bread with a hole
baker|Bread maker
banjo|Twangy string instrument
basil|Pesto herb
beach|Sandy shore
beard|Chin hair
berry|Small juicy fruit
bench|Park seat
bison|Shaggy prairie animal
black|Shade of coal
blank|Empty
blaze|Bright fire
bloom|Flower
board|Chess is played on it
boots|Hiking wear
brain|Thinking organ
brave|Full of courage
bread|Toast, before toasting
brick|Building block
bride|She walks down the aisle
broom|Sweeper
brown|Chocolate shade
brush|Painter's tool
bugle|Army wake-up horn
bunny|Easter hopper
cabin|Log house in the woods
cable|Thick wire
camel|Desert animal with humps
canal|Man-made waterway
candy|Sweets
canoe|Paddled boat
cargo|Ship's load
carol|Christmas song
chain|Row of links
chair|Seat with a back
chalk|Blackboard writer
cheek|Side of the face
chess|Game of kings and pawns
chick|Baby bird
chili|Spicy stew
choir|Group of singers
cider|Apple drink
clean|Not dirty
clerk|Shop worker
cliff|Steep rock face
climb|Go up a ladder
clock|It ticks
cloud|Fluffy thing in the sky
clown|Circus joker
coach|Team trainer
coast|Seaside
cobra|Hooded snake
cocoa|Hot chocolate powder
comet|It has a long tail in space
coral|Reef builder
couch|Sofa
count|One, two, three
cover|Lid
crane|Tall building-site machine
crash|Loud bang
crate|Wooden shipping box
crisp|Crunchy
crown|King's headwear
crumb|Tiny bit of bread
crust|Edge of a pizza
curve|Bend in the road
daisy|White flower with a yellow middle
dance|Waltz or tango
diary|Daily journal
diner|Roadside restaurant
dizzy|Spinning inside
dozen|Twelve
dream|Sleeping story
dress|Frock
drink|Juice or milk
drive|Steer a car
eagle|Great bird of prey
early|Before time
earth|Our planet
easel|Painter's stand
eight|Spider's leg count
elbow|Arm joint
empty|Nothing inside
enjoy|Have a good time
enter|Come in
equal|The same
event|Happening
extra|More than needed
fable|Story with a moral
fairy|Tiny winged wish-granter
feast|Huge meal
fence|Garden border
ferry|Boat that carries cars
field|Meadow
flame|Candle top
flash|Camera burst
fleet|Group of ships
float|Stay on top of the water
flock|Group of sheep
flood|Too much water
floor|You walk on it
flour|Baker's powder
flute|Wind instrument held sideways
focus|Concentrate
forty|Four tens
fresh|Just picked
front|Opposite of back
frost|Icy morning coating
fruit|Apples and oranges
funny|Making you laugh
ghost|Spooky spirit
giant|Jack met one up the beanstalk
glass|Window material
globe|Round map of the world
glove|Hand warmer
goose|Honking bird
grape|Fruit on a vine
grass|Lawn
great|Wonderful
green|Go light shade
group|Bunch
guard|Castle watcher
guess|Answer without knowing
guest|Party visitor
guide|Tour leader
happy|Glad
heart|Valentine shape
heavy|Hard to lift
hedge|Row of bushes
hello|Greeting
hippo|River heavyweight
hobby|Pastime
honey|Bee's sweet stuff
horse|Animal with a saddle
hotel|Place to stay on a trip
house|Home
human|Person
igloo|Home made of ice
image|Picture
jeans|Denim trousers
jelly|Wobbly dessert
jewel|Precious stone
juice|Orange drink
jolly|Merry
judge|Courtroom boss
kayak|Paddler's narrow boat
knife|Butter spreader
koala|Sleepy tree hugger from Australia
label|Tag
ladle|Soup spoon
large|Big
laugh|Giggle
layer|One level of a cake
learn|Find out
lemon|Sour yellow fruit
level|Flat and even
light|Not heavy
lilac|Pale purple flower
llama|Woolly animal from the Andes
lodge|Ski cabin
lucky|Fortunate
lunch|Midday meal
magic|Wizard's art
maple|Syrup tree
march|Month after February
match|Fire starter
mayor|Town leader
medal|Olympic prize
melon|Big juicy fruit
merry|Jolly
metal|Iron or gold
model|Small copy
money|Coins and notes
month|May or June
moose|Antlered giant of the north
motor|Engine
mouse|Cheese lover
mouth|It holds your teeth
movie|Film
music|Notes and tunes
night|When owls are awake
noise|Racket
north|Top of a map
novel|Long story book
nurse|Hospital helper
ocean|Atlantic or Pacific
olive|Small oval fruit on a pizza
onion|It makes you cry in the kitchen
opera|Play that is sung
orbit|Path around the sun
organ|Church keyboard
otter|Playful river swimmer
owner|One who has it
paint|Artist's liquid
panda|Black and white bamboo eater
paper|You write on it
party|Birthday bash
pasta|Spaghetti or macaroni
patch|Cover for a hole in jeans
peach|Fuzzy fruit
pearl|Oyster's gem
pedal|Bike part for a foot
penny|One cent
perch|Bird's resting spot
petal|Part of a flower
phone|It rings
piano|It has 88 keys
pilot|Plane flier
pizza|Pie with cheese and tomato
place|Spot
plane|Jet
plant|Fern or cactus
plate|Dinner dish
point|Sharp end
polar|Kind of bear
porch|Front of the house, with a swing
pouch|Kangaroo's pocket
prize|Winner's reward
proud|Pleased with yourself
puppy|Young dog
purse|Coin holder
queen|Most powerful chess piece
quick|Fast
quiet|Not loud
quilt|Patchwork bed cover
radio|It plays music in the car
rainy|Wet outside
ranch|Cowboy's farm
raven|Large black bird
reach|Stretch for
ready|All set
right|Correct
river|Nile or Amazon
roast|Cook in the oven
robin|Bird with a red breast
robot|Machine that walks and talks
rocky|Full of stones
round|Like a ball
route|Way to go
royal|Like a king or queen
ruler|It measures inches
salad|Lettuce dish
sauce|Pasta topping
scale|It tells your weight
scarf|Neck warmer
scout|One who earns badges
seven|Days in a week
shade|Cool spot under a tree
shape|Circle or square
shark|Fish with a fin above the water
sheep|Woolly animal
shelf|Book holder
shell|Seaside find
shine|Glow
shirt|Top with buttons
short|Not tall
skate|Glide on ice
skirt|It hangs from the waist
sleep|Rest at night
slide|Playground ride
small|Little
smart|Clever
smile|Happy look
snack|Small bite between meals
snail|Slow mover with a shell
snake|It slithers
solar|From the sun
sound|Noise
south|Bottom of a map
space|Where rockets go
spoon|Soup tool
sport|Tennis or golf
spray|Mist from a bottle
squid|Sea animal with ten arms
stage|Actors stand on it
stair|Step
stamp|It goes on an envelope
steam|Kettle cloud
stick|Thrown for a dog to fetch
stone|Rock
stork|Bird said to bring babies
storm|Thunder and lightning
story|Tale
stove|Kitchen cooker
straw|You sip through it
sugar|Sweet stuff in a bowl
sunny|Bright outside
swamp|Alligator's home
sweet|Like candy
swing|Playground seat on chains
table|Dinner goes on it
teach|Give a lesson
teeth|A dentist checks them
thick|Not thin
three|Number of blind mice
thumb|Short finger
tiger|Big cat with stripes
toast|Bread, browned
today|This very day
torch|Olympic flame carrier
towel|Bath dryer
tower|Tall part of a castle
track|Train runs on it
trail|Hiking path
train|It runs on rails
treat|Reward for a good dog
truck|Big road hauler
trunk|Elephant's nose
tulip|Spring flower from Holland
uncle|Dad's brother
under|Below
video|Clip to watch
visit|Drop in on
voice|You sing with it
wagon|Cart pulled by horses
watch|Clock on your wrist
water|It comes from the tap
wheat|Bread grain
wheel|Round part of a bike
white|Shade of snow
whole|All of it
world|The Earth
wrist|Where a watch goes
write|Use a pen
young|Not old
zebra|Horse in stripes
acorns|Squirrel's winter store
action|Director's shout
animal|Zoo resident
answer|What a question wants
anchor|It holds a ship in place
arctic|Icy region at the top of the world
artist|Painter
autumn|Season of falling leaves
bakery|Shop that smells of bread
ballet|Dance on tiptoe
banana|Monkey's snack
basket|Picnic carrier
beaver|Dam builder
beetle|Bug with a hard shell
bottle|Ketchup holder
bridge|Way over a river
bubble|Soap sphere
bucket|Pail
butter|Toast topping
button|Shirt fastener
cactus|Prickly desert plant
camera|Photo taker
candle|It sits on a birthday cake
canyon|Deep rocky valley
carpet|Floor covering
carrot|Orange vegetable for a rabbit
castle|Home with a moat
cellar|Room under the house
cereal|Breakfast in a bowl
cheese|Mouse's snack
cherry|Small red fruit on a stem
circle|Round shape
circus|Big top show
clover|Lucky plant with four leaves
cobweb|Dusty corner find
coffee|Morning drink for grown-ups
cookie|Chocolate chip treat
copper|Penny metal
cotton|T-shirt fabric
cousin|Aunt's child
cradle|Baby's rocking bed
crayon|Wax drawing stick
dancer|Ballerina
desert|Dry sandy place
dinner|Evening meal
doctor|One who makes you well
dragon|Fire breather
drawer|Sock holder in a dresser
eleven|Number after ten
engine|Car's motor
eraser|Pencil's other end
falcon|Fast hunting bird
family|Mom, Dad and the kids
farmer|Tractor driver
feather|Bird's covering
finger|One of ten on your hands
flower|Rose or tulip
forest|Lots of trees
fossil|Dinosaur bone, now stone
friend|Pal
garden|Where vegetables grow
garlic|Strong-smelling bulb
ginger|Spice in a man-shaped cookie
goblin|Small fairy tale troublemaker
guitar|It has six strings
hammer|Nail driver
harbor|Safe place for ships
heaven|Paradise
helmet|Bike rider's headgear
hockey|Game with a puck
iguana|Big green lizard
insect|Six-legged bug
island|Land with water all around
jacket|Light coat
jigsaw|Puzzle in pieces
jungle|Tarzan's home
kettle|It whistles on the stove
kitten|Baby cat
ladder|It helps you reach the roof
lizard|Scaly sunbather
magnet|It sticks to the fridge
marble|Small glass ball
market|Place to buy fruit
meadow|Grassy field
mirror|It shows your face
mitten|Glove with no fingers
monkey|Banana lover
muffin|Blueberry breakfast cake
museum|Home for old treasures
napkin|Lap cover at dinner
needle|Sewing tool
orange|Fruit that is also a shade
oyster|Pearl maker
palace|Royal home
parrot|Bird that talks
pebble|Small smooth stone
pencil|Writer with an eraser
pepper|Salt's partner
picnic|Meal on a blanket
pillow|Head rest in bed
pirate|Sailor with an eye patch
planet|Mars or Venus
pocket|Place for keys
potato|Vegetable that becomes fries
puddle|Rainy day splash spot
puppet|Toy on strings
puzzle|This is one
rabbit|Carrot muncher
rocket|It blasts off
saddle|Horse rider's seat
sailor|Ship's crew member
school|Place with classes
season|Spring or summer
shadow|It follows you on a sunny day
silver|Second place medal
sister|Girl sibling
spider|Web spinner
spring|Season of new flowers
square|Shape with four equal sides
stable|Horse's home
street|Road in a town
summer|Hottest season
sunset|End of the day's light
supper|Evening meal
tennis|Game with a net and rackets
thirty|Half of sixty
ticket|It gets you into the show
tomato|Ketchup fruit
tunnel|Way through a mountain
turkey|Thanksgiving bird
turtle|Slow mover with a shell
valley|Low land between hills
violin|Fiddle
walrus|Tusked animal of the ice
window|Glass in a wall
winter|Coldest season
wizard|Spell caster
yellow|Shade of a banana
zipper|Coat closer
airport|Where planes land
alphabet|A to Z
balloon|Party decoration full of air
bedroom|Where you sleep
bicycle|Two-wheeler
blanket|Bed warmer
bowling|Game with ten pins
brother|Boy sibling
buffalo|Bison
cabbage|Leafy vegetable in coleslaw
captain|Ship's leader
caravan|Home on wheels
cartoon|Animated show
chapter|Part of a book
cheetah|Fastest land animal
chicken|Bird that clucks
chimney|Santa's way in
compass|It points north
concert|Live music show
costume|Halloween outfit
country|France or Japan
cricket|Chirping insect
cupcake|Small frosted treat
curtain|Window drape
diamond|Sparkling gem
dolphin|Smart sea mammal that leaps
drawing|Pencil picture
evening|Time after sunset
explore|Go looking around
factory|Where things are made
feather|It tickles
firefly|Bug that glows
fishing|Hobby with a rod
flannel|Soft shirt fabric
freezer|Ice cream keeper
giraffe|Tallest animal
gorilla|Largest ape
grandma|Mom's mom
grandpa|Dad's dad
hamster|Pet that runs on a wheel
harvest|Gathering of crops
holiday|Day off
journey|Long trip
kingdom|Land ruled by a queen
kitchen|Room for cooking
ladybug|Red beetle with black spots
lantern|Camping light
laundry|Clothes to wash
lettuce|Salad leaves
library|Building full of books
lobster|Red sea creature with claws
machine|Robot, for one
mailbox|Where letters land
mermaid|Half woman, half fish
monster|Thing under the bed
morning|Time for breakfast
mustard|Yellow hot dog topping
octopus|Sea animal with eight arms
orchard|Field of fruit trees
ostrich|Biggest bird
painter|Artist
pancake|Flat breakfast treat with syrup
panther|Black big cat
parade|March with floats
peacock|Bird with a fan of feathers
pelican|Bird with a pouch in its beak
penguin|Bird in a tuxedo
picture|Photo
popcorn|Movie snack
postman|Letter carrier
pumpkin|Jack-o'-lantern
pyramid|Ancient tomb in Egypt
rainbow|Arc after a shower
raccoon|Masked bandit of the bins
sandbox|Place to dig at the park
seagull|Bird that steals your chips
sunrise|Start of the day
teacher|Class leader
thunder|Boom after lightning
tractor|Farm vehicle
trumpet|Brass instrument with three valves
unicorn|Horse with a horn
vanilla|Plain ice cream flavor
village|Small town
volcano|Mountain that erupts
weather|Rain or shine
whistle|Referee's blower
aquarium|Fish tank
backpack|School bag
baseball|Game with nine innings
birthday|Day for cake and candles
blizzard|Heavy snowstorm
broccoli|Vegetable like little trees
building|Skyscraper
calendar|It shows the months
campfire|Marshmallow toaster
carnival|Fair with rides
cupboard|Kitchen storage
daffodil|Yellow spring flower
dinosaur|Tyrannosaurus, for one
doorbell|Ding-dong maker
elephant|Animal with a trunk
envelope|Letter holder
exercise|Push-ups and jogging
fountain|Water feature in a square
goldfish|Pet in a bowl
hedgehog|Small prickly animal
homework|After-school task
hospital|Where nurses work
kangaroo|Hopper with a pouch
keyboard|It has a space bar
lemonade|Summer stand drink
magician|Rabbit-from-a-hat performer
medicine|Doctor's cure
mountain|Everest, for one
mushroom|Pizza topping that grows in the woods
necklace|Jewelry for the throat
notebook|Pad for writing
painting|Art on a canvas
pancakes|Stack with syrup
pineapple|Spiky tropical fruit
platypus|Mammal with a duck's bill
princess|King's daughter
rainfall|What a gauge measures
sandwich|Lunch between two slices
scissors|Paper cutters
seahorse|Small fish with a curly tail
shoelace|It gets tied in a bow
skeleton|All your bones
snowball|Winter thing to throw
snowflake|No two are alike
squirrel|Nut gatherer
starfish|Sea creature with five arms
sunshine|Bright daylight
swimming|Pool activity
teaspoon|Small stirrer
tortoise|Slow winner of the race
triangle|Shape with three sides
umbrella|Rain shield
vacation|Time away
whiskers|Cat's face feelers
windmill|It turns in the breeze
adventure|Exciting journey
alligator|Swamp reptile with a big bite
astronaut|Space traveler
bedtime|When the lights go out
blueberry|Small round muffin fruit
breakfast|First meal
butterfly|It was once a caterpillar
chocolate|Cocoa treat
classroom|Where lessons happen
crocodile|River reptile with a long snout
dandelion|Weed you blow to make a wish
detective|Clue finder
excellent|Very, very good
fireworks|Bangs in the night sky
furniture|Tables and chairs
gardening|Hobby with a trowel
honeybee|Hive worker
hurricane|Enormous storm
invisible|Impossible to see
jellyfish|Sea creature that stings
lighthouse|Tower that warns ships
lunchtime|Noon break
marmalade|Orange spread for toast
newspaper|Daily read
orchestra|Violins, flutes and drums together
pineapple|Fruit on a tropical pizza
playground|Place with slides
porcupine|Animal covered in quills
raspberry|Red bramble fruit
rectangle|Shape of a door
sailboat|Wind-powered craft
scarecrow|Straw figure in a field
spaceship|Rocket for astronauts
spaghetti|Long thin pasta
telephone|It rings
telescope|Star viewer
tangerine|Small orange
treehouse|Den up in the branches
vegetable|Carrot or pea
waterfall|River going over a cliff
wonderful|Marvelous
yesterday|Day before today
`;

export interface ClueEntry {
  readonly word: string;
  /** One or more ways of asking for it. */
  readonly clues: readonly string[];
}

function parse(bank: string): ClueEntry[] {
  const byWord = new Map<string, string[]>();
  for (const line of bank.split("\n")) {
    if (!line) continue;
    const [word, ...clues] = line.split("|");
    // A word listed twice is one word with more clues, not two words.
    const known = byWord.get(word!);
    if (known) known.push(...clues);
    else byWord.set(word!, clues);
  }
  return [...byWord].map(([word, clues]) => ({ word, clues }));
}

export const CLUES: readonly ClueEntry[] = parse(BANK);

/** The clue lines as written, for the test that checks their shape. */
export const CLUE_LINES: readonly string[] = BANK.split("\n").filter(Boolean);

const BY_WORD: ReadonlyMap<string, ClueEntry> = new Map(CLUES.map((entry) => [entry.word, entry]));

export function clueEntry(word: string): ClueEntry | undefined {
  return BY_WORD.get(word);
}
