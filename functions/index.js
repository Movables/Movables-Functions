const admin = require('firebase-admin');
const functions = require('firebase-functions');
const geolib = require('geolib');
const algoliasearch = require('algoliasearch');

admin.initializeApp(functions.config().firebase);

const db = admin.firestore();

// Initialize Algolia, requires installing Algolia dependencies:
// https://www.algolia.com/doc/api-client/javascript/getting-started/#install
//
// App ID and API Key are stored in functions config variables
const ALGOLIA_ID = functions.config().algolia.app_id;
const ALGOLIA_ADMIN_KEY = functions.config().algolia.api_key;
const ALGOLIA_SEARCH_KEY = functions.config().algolia.search_key;

const ALGOLIA_PACKAGES_INDEX_NAME = 'packages';
const ALGOLIA_TOPICS_INDEX_NAME = 'topics';
const ALGOLIA_TOPIC_CONVERSATION_INDEX_NAME = "topicConversations";
const client = algoliasearch(ALGOLIA_ID, ALGOLIA_ADMIN_KEY);

exports.userLogout = functions.https.onCall((data, context) => {
    // find app_instance
    // disassociate uid from app_instance
});

// Update the search index every time a blog post is written.
exports.onPackageLocationUpdated = functions.firestore.document('packages/{packageId}').onWrite((change, context) => {
    // Get the note document
    const updatedPackageData = change.after.data();
    let categoriesArray = [];
    for (var key in updatedPackageData['categories']) {
        // check if the property/key is defined in the object itself, not in parent
        if (updatedPackageData['categories'].hasOwnProperty(key)) {
            categoriesArray.push(key);
        }
    }

    const packagePreview = {
        'tagName': updatedPackageData['tag']['name'],
        'headline': updatedPackageData['headline'],
        'recipientName': updatedPackageData['recipient']['name'],
        'moversCount': updatedPackageData['count']['movers'],
        'followersCount': updatedPackageData['count']['followers'],
        'destination': updatedPackageData['destination'],
        'origin': {
            'lat': updatedPackageData['origin']['geo_point'].latitude,
            'lng': updatedPackageData['origin']['geo_point'].longitude
        },
        '_geoloc': {
            'lat': updatedPackageData['_geoloc'].latitude,
            'lng': updatedPackageData['_geoloc'].longitude
        },
        'dueDate': Math.round(new Date(updatedPackageData['due_date']['end']).getTime() / 1000),
        '_tags': categoriesArray,
        'status': updatedPackageData['status'],
    };

    // Add an 'objectID' field which Algolia requires
    packagePreview.objectID = context.params.packageId;

    // Write to the algolia index
    const index = client.initIndex(ALGOLIA_PACKAGES_INDEX_NAME);
    return index.saveObject(packagePreview);
});

// Update tags everytime a write operation is performed on a topic(tag)
exports.onTopicUpdated = functions.firestore.document('topics/{topicId}').onWrite((change, context) => {
    // Get the note document
    const updatedTopicData = change.after.data();

    const topic = {
        'tag': updatedTopicData['tag'],
        'templatesCount': updatedTopicData['count']['templates'],
        'packagesCount': updatedTopicData['count']['packages'],
    };

    // Add an 'objectID' field which Algolia requires
    topic.objectID = change.after.ref.id;

    // Write to the algolia index
    const index = client.initIndex(ALGOLIA_TOPICS_INDEX_NAME);
    return index.saveObject(topic);
});

// Update topic conversation index on conversation creation
exports.onTopicConversationCreated = functions.firestore.document('topics/{topicId}/conversations/{conversationId}').onCreate((snapshot, context) => {
    const data = snapshot.data();
    const key = Object.keys(data["legislative_area"])[0];
    const value = data["legislative_area"][key];
    var newConversation = {
        "objectID": snapshot.ref.id,
    }
    newConversation[key] = value;
    // Write to the algolia index
    const index = client.initIndex(ALGOLIA_TOPIC_CONVERSATION_INDEX_NAME);
    return index.saveObject(newConversation);
});