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
const ALGOLIA_TOPIC_CONVERSATION_INDEX_NAME = "conversations";
const client = algoliasearch(ALGOLIA_ID, ALGOLIA_ADMIN_KEY);

exports.userLogout = functions.https.onCall((data, context) => {
    // find app_instance
    // disassociate uid from app_instance
});

// save topics to algolia when they are created
exports.onTopicCreation = functions.firestore.document('topics/{topicID}').onWrite((change, context) => {
    const topicData = change.after.data();
    var topic = {
        'count': {
            'packages': topicData['count']['packages'],
            'templates': topicData['count']['templates'],
        },
        'name': topicData['name'],
        'description': topicData['description']
    };
    topic.objectID = context.params.topicID;

    // Write to the algolia index
    const index = client.initIndex(ALGOLIA_TOPICS_INDEX_NAME);
    return index.saveObject(topic);
});

// remove topic from algolia index when it is deleted
exports.onTopicDeletion = functions.firestore.document('topics/{topicID}').onDelete((snapshot, context) => {
    const index = client.initIndex(ALGOLIA_TOPICS_INDEX_NAME);
    return index.deleteObject(context.params.topicID);
});

// save package and logistics to algolia index when they are created
exports.onPackageCreation = functions.firestore.document('packages/{packageID}').onWrite((change, context) => {
    const packageData = change.after.data();
    let packageContent = packageData['content'];
    let packageLogistics = packageData['logistics'];
    let packageRelations = packageData['relations'];

    var packageRecord = {
        '_geoloc': {
            'lat': packageLogistics['current_location'].latitude,
            'lng': packageLogistics['current_location'].longitude,
        },
        'content': {
            'category': packageContent['category'],
            'description': packageContent['description'],
            'destination': {
                'address': packageContent['destination']['address'],
                'geo_point': {
                    'lat': packageContent['destination']['geo_point'].latitude,
                    'lng': packageContent['destination']['geo_point'].longitude
                },
                'name': packageContent['destination']['name'],
            },
            'due_date': Math.round(new Date(packageContent['due_date']).getTime() / 1000),
            'externalActions': packageContent['external_actions'],
            'headline': packageContent['headline'],
            'topic': {
                'name': packageContent['topic']['name'],
                'documentID': packageContent['topic']['reference'].id,
            }
        },
        'logistics': {
            'created_date': Math.round(new Date(packageLogistics['created_date']).getTime() / 1000),
            'status': packageLogistics['status'],
            'origin': {
                'address': packageLogistics['origin']['address'],
                'geo_point': {
                    'lat': packageLogistics['origin']['geo_point'].latitude,
                    'lng': packageLogistics['origin']['geo_point'].longitude
                },
                'name': packageLogistics['origin']['name'],
            },
            'author': {
                'name': packageLogistics['author']['name'],
                'documentID': packageLogistics['author']['reference'].id,
            },
        },
        'relations': {
            'count': {
                'followers': packageRelations['count']['followers'],
                'movers': packageRelations['count']['movers'],
            },
            'followers': packageRelations['followers'],
        },
    };

    // update packageRecord with cover_pic_url if it exists
    if (packageContent.hasOwnProperty('cover_pic_url')) {
        packageRecord['content']['cover_pic_url'] = packageContent['cover_pic_url'];
    }

    // update packageRecord with author pic_url if it exists
    if (packageLogistics['author'].hasOwnProperty('pic_url')) {
        packageRecord['logistics']['author']['pic_url'] = packageLogistics['author']['pic_url'];
    }

    // update packageRecord with dropoff_message if it exists
    if (packageContent.hasOwnProperty('dropoff_message')) {
        packageRecord['content']['dropoff_message'] = packageContent['dropoff_message'];
    }
    
    // update packageRecord with externalActions if it exists
    if (packageContent.hasOwnProperty('external_actions')) {
        packageRecord['content']['external_actions'] = packageContent['external_actions'];
    }
    
    // update packageRecord with recipient after checking available info
    let packageRecipientRaw = packageContent['recipient'];
    var packageRecipient = {
        'name': packageRecipientRaw['name'],
        'documentID': packageRecipientRaw['reference'].id,
        'type': packageRecipientRaw['type'],
        
    }
    if (packageRecipientRaw.hasOwnProperty('pic_url')) {
        packageRecipient['pic_url'] = packageRecipientRaw['pic_url'];
    }
    if (packageRecipientRaw.hasOwnProperty('twitter')) {
        packageRecipient['twitter'] = packageRecipientRaw['twitter'];
    }
    if (packageRecipientRaw.hasOwnProperty('facebook')) {
        packageRecipient['facebook'] = packageRecipientRaw['facebook'];
    }
    if (packageRecipientRaw.hasOwnProperty('phone')) {
        packageRecipient['phone'] = packageRecipientRaw['phone'];
    }
    packageRecord['content']['recipient'] = packageRecipient;

    // update pakcageRecord with in_transit_by if it exists
    if (packageLogistics.hasOwnProperty('in_transit_by')) {
        packageRecord['logistics']['in_transit_by'] = {
            'name': packageLogistics['in_transit_by']['name'],
            'documentID': packageLogistics['in_transit_by']['reference'].id,
        };
        if (packageLogistics['in_transit_by'].hasOwnProperty('pic_url')){
            packageRecord['logistics']['in_transit_by']['pic_url'] = packageLogistics['in_transit_by']['pic_url'];
        }
    }

    // update packageRecord with content_template_by if it exists
    if (packageLogistics.hasOwnProperty('content_template_by')) {
        packageRecord['logistics']['content_template_by'] = {
            'name': packageLogistics['content_template_by']['name'],
            'documentID': packageLogistics['content_template_by']['reference'].id,
        };
        if (packageLogistics['content_template_by'].hasOwnProperty('pic_url')){
            packageRecord['logistics']['content_template_by']['pic_url'] = packageLogistics['content_template_by']['pic_url'];
        }
    }

    // use packageID as Algolia objectId
    packageRecord.objectID = context.params.packageID;

    // Write to the algolia index
    const index = client.initIndex(ALGOLIA_PACKAGES_INDEX_NAME);
    return index.saveObject(packageRecord);
});

// remove package from algolia index when it is deleted
exports.onPackageDeletion = functions.firestore.document('packages/{packageID}').onDelete((snapshot, context) => {
    const index = client.initIndex(ALGOLIA_PACKAGES_INDEX_NAME);
    return index.deleteObject(context.params.packageID);
});

// Update topic conversation index on conversation creation
exports.onConversationCreated = functions.firestore.document('topics/{topicId}/conversations/{conversationID}').onCreate((snapshot, context) => {
    const data = snapshot.data();
    const key = Object.keys(data["legislative_area"])[0];
    const value = data["legislative_area"][key];
    var newConversation = {};
    newConversation[key] = value;
    newConversation.objectID = context.params.conversationID;
    // Write to the algolia index
    const index = client.initIndex(ALGOLIA_TOPIC_CONVERSATION_INDEX_NAME);
    return index.saveObject(newConversation);
});

// remove topic from algolia index when it is deleted
exports.onConversationDeletion = functions.firestore.document('topics/{topicID}/conversations/{conversationID}').onDelete((snapshot, context) => {
    const index = client.initIndex(ALGOLIA_TOPIC_CONVERSATION_INDEX_NAME);
    return index.deleteObject(context.params.conversationID);
});
