'use strict';



// Import the Dialogflow module and response creation dependencies from the 
// Actions on Google client library.
const {
    dialogflow,
    DeliveryAddress,
    OrderUpdate,
    TransactionDecision,
    TransactionRequirements,
    Suggestions,
    List,
    Cart,
    Image
} = require('actions-on-google');
const functions = require('firebase-functions');
var request = require('sync-request');

const GENERIC_EXTENSION_TYPE =
    'type.googleapis.com/google.actions.v2.orders.GenericExtension';
const UNIQUE_ORDER_ID = '<UNIQUE_ORDER_ID>';

const app = dialogflow({
    debug: true
});

var menu;

// ------------------DATA--------------------------

// ----------------FUNCTIONS-----------------------

// function load() {
//   var actual_JSON;
//   var value = function(file, callback) {
//     var XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
//     var xobj = new XMLHttpRequest();
//     //xobj.overrideMimeType("application/json");
//     xobj.open('GET', file, false); // Replace 'my_data' with the path to your file
//     xobj.onreadystatechange = function () {
//       if (xobj.readyState == 4 && xobj.status == "200") {
//         // Required use of an anonymous callback as .open will NOT return a value but simply returns undefined in asynchronous mode
//         return callback(xobj.responseText);
//       }
//     };
//     xobj.send(null);  
//   } ("https://cameraobscura-dot-1-dot-doubleb-automation-production.appspot.com/api/menu", function(result) {actual_JSON = JSON.parse(result);});
//   return actual_JSON;
// }

function getMenuJSON(url, callback) {
    request({
        url: url,
        json: true
    }, function (error, response, body) {
        if (error || response.statusCode !== 200) {
            return callback(error || {
                statusCode: response.statusCode
            });
        }
        callback(null, body);
    });
}

// function getJSON() {
//     var res = request('GET', "https://cameraobscura-dot-1-dot-doubleb-automation-production.appspot.com/api/menu", {
//         json: true,
//         host: 'localhost',
//         method: 'GET'
//       });
//     menu = JSON.parse(res.body.toString('utf-8'));
//     console.log(menu);
// }

const HelpList = () => {
    const lst = new List({
        items: {
            'order making': {
                title: 'Сделать заказ',
                description: 'С помощью этого запроса вы можете сделать заказ',
                synonyms: ['заказ'],
                image: new Image({
                    url: 'https://lh3.googleusercontent.com' +
                        '/Nu3a6F80WfixUqf_ec_vgXy_c0-0r4VLJRXjVFF_X_CIilEu8B9fT35qyTEj_PEsKw',
                    alt: 'Make order',
                }),
            },
            'order status': {
                title: 'Статус текущего заказа',
                description: 'С помошью этой команды вы можете узнать о состоянии заказа',
                synonyms: ['заказ', 'статус'],
                image: new Image({
                    url: 'https://developers.google.com/actions/images/badges' +
                        '/XPM_BADGING_GoogleAssistant_VER.png',
                    alt: 'Order status',
                }),
            },
            'balance status': {
                title: 'Баланс',
                description: 'С помощью этого запроса вы можете узнать о вашем текущем балансе',
                synonyms: ['баланс'],
                image: new Image({
                    url: 'https://allo.google.com/images/allo-logo.png',
                    alt: 'Balance status',
                }),
            },
            'repeat order': {
                title: 'Повторить предыдущий заказ',
                description: 'С помощью этого запроса вы можете повторить предыдущий заказ',
                synonyms: ['повторить'],
                image: new Image({
                    url: 'https://allo.google.com/images/allo-logo.png',
                    alt: 'Repeat order',
                }),
            },
        }
    });
    return lst;
};

const BalanceStatus = () => {
    const amount = Math.floor(Math.random() * 10000) + 1000;
    var ley = [0, 5, 6, 7, 8, 9];
    var lya = [2, 3, 4];
    const x = amount % 10;
    var rubles = ley.indexOf(x) > -1 ? 'рублей' : (lya.indexOf(x) > -1 ? 'рубля' : 'рубль');
    return 'Баланс вашего счёта: ' + amount + ' ' + rubles;
};

const OrderStatus = () => {
    // var status = ['в процессе доставки', 'готовится', 'доставлен', 'в процессе обработки'];
    // const cur_status = status[Math.floor(Math.random() * 4)];
    const argum = conv.arguments.get('TRANSACTION_DECISION_VALUE');
    const minorId = arg.order.finalOrder.id;
    return 'Статус вашего заказа: ' + cur_status;
};

// --------------ACTIONS-INTENTS-------------------

// app.intent('actions_intent_PERMISSION', (conv, params, permissionGranted) => {
//     if (!permissionGranted) {
//         conv.close(`Прошу прощения, до свидания!`);
//     } else {
//         conv.followup('Default-Welcome-Intent-custom'); // Event on 'Default Welcome Intent - custom'
//     }
// });

app.intent('actions_intent_DELIVERY_ADDRESS', (conv) => {
    const arg = conv.arguments.get('DELIVERY_ADDRESS_VALUE');
    if (arg.userDecision === 'ACCEPTED') {
        console.log('DELIVERY ADDRESS: ' +
            arg.location.postalAddress.addressLines[0]);
        conv.data.deliveryAddress = arg.location;
        conv.ask('Отлично, доставим на адрес ' + arg.location.postalAddress.addressLines[0] + '. Что будем заказывать?');
    } else {
        conv.close('Извините, не расслышал вашего адреса.');
    }
});

// ------------------INTENTS-----------------------

// app.intent('Default Welcome Intent', (conv) => {
//     const options = {
//         reason: 'Чтобы узнать, куда доставить заказ',
//     };
//     conv.ask(new DeliveryAddress(options));
// });

app.intent('transaction_check_action', (conv) => {
    conv.ask(new TransactionRequirements({
        orderOptions: {
            requestDeliveryAddress: false,
        },
        paymentOptions: {
            actionProvidedOptions: {
                displayName: 'VISA-1234',
                paymentType: 'PAYMENT_CARD',
            },
        },
    }));
});

app.intent('transaction_check_complete', (conv) => {
    const arg = conv.arguments.get('TRANSACTION_REQUIREMENTS_CHECK_RESULT');
    if (arg && arg.resultType === 'OK') {
        conv.ask(new DeliveryAddress({
            addressOptions: {
                reason: 'Чтобы узнать, куда доставить заказ',
            }
        }));
    } else {
        conv.close('Transaction failed.');
    }
});

app.intent('transaction_decision_action', (conv, {
    menu
}) => {
    var positions = [];
    for (var i = 0; i < menu.length; i++) {
        var new_pos = {
            name: menu[i].toString(),
            id: i.toString(),
            price: {
                amount: {
                    currencyCode: 'RUB',
                    nanos: 0,
                    units: 3,
                },
                type: 'ACTUAL',
            },
            quantity: 1,
            subLines: [{
                note: '???',
            }],
            type: 'REGULAR',
        };
        positions.push(new_pos);
    }

    const order = {
        id: UNIQUE_ORDER_ID,
        cart: {
            merchant: {
                id: 'test_store_1',
                name: 'First test store',
            },
            lineItems: positions,
            notes: 'Test order',
            otherItems: [{
                    name: 'Subtotal',
                    id: 'subtotal',
                    price: {
                        amount: {
                            currencyCode: 'RUB',
                            nanos: 0,
                            units: 3 * menu.length,
                        },
                        type: 'ESTIMATE',
                    },
                    type: 'SUBTOTAL',
                },
                {
                    name: 'Tax',
                    id: 'tax',
                    price: {
                        amount: {
                            currencyCode: 'RUB',
                            nanos: 0,
                            units: 0,
                        },
                        type: 'ESTIMATE',
                    },
                    type: 'TAX',
                },
            ],
        },
        otherItems: [],
        totalPrice: {
            amount: {
                currencyCode: 'RUB',
                nanos: 0,
                units: 3 * menu.length,
            },
            type: 'ESTIMATE',
        },
    };

    // const order = {
    //     id: UNIQUE_ORDER_ID,
    //     cart: {
    //       merchant: {
    //         id: 'book_store_1',
    //         name: 'Book Store',
    //       },
    //       lineItems: [
    //         {
    //           name: 'My Memoirs',
    //           id: 'memoirs_1',
    //           price: {
    //             amount: {
    //               currencyCode: 'USD',
    //               nanos: 990000000,
    //               units: 3,
    //             },
    //             type: 'ACTUAL',
    //           },
    //           quantity: 1,
    //           subLines: [
    //             {
    //               note: 'Note from the author',
    //             },
    //           ],
    //           type: 'REGULAR',
    //         },
    //         {
    //           name: 'Memoirs of a person',
    //           id: 'memoirs_2',
    //           price: {
    //             amount: {
    //               currencyCode: 'USD',
    //               nanos: 990000000,
    //               units: 5,
    //             },
    //             type: 'ACTUAL',
    //           },
    //           quantity: 1,
    //           subLines: [
    //             {
    //               note: 'Special introduction by author',
    //             },
    //           ],
    //           type: 'REGULAR',
    //         },
    //         {
    //           name: 'Their memoirs',
    //           id: 'memoirs_3',
    //           price: {
    //             amount: {
    //               currencyCode: 'USD',
    //               nanos: 750000000,
    //               units: 15,
    //             },
    //             type: 'ACTUAL',
    //           },
    //           quantity: 1,
    //           subLines: [
    //             {
    //               lineItem: {
    //                 name: 'Special memoir epilogue',
    //                 id: 'memoirs_epilogue',
    //                 price: {
    //                   amount: {
    //                     currencyCode: 'USD',
    //                     nanos: 990000000,
    //                     units: 3,
    //                   },
    //                   type: 'ACTUAL',
    //                 },
    //                 quantity: 1,
    //                 type: 'REGULAR',
    //               },
    //             },
    //           ],
    //           type: 'REGULAR',
    //         },
    //         {
    //           name: 'Our memoirs',
    //           id: 'memoirs_4',
    //           price: {
    //             amount: {
    //               currencyCode: 'USD',
    //               nanos: 490000000,
    //               units: 6,
    //             },
    //             type: 'ACTUAL',
    //           },
    //           quantity: 1,
    //           subLines: [
    //             {
    //               note: 'Special introduction by author',
    //             },
    //           ],
    //           type: 'REGULAR',
    //         },
    //       ],
    //       notes: 'The Memoir collection',
    //       otherItems: [],
    //     },
    //     otherItems: [
    //       {
    //         name: 'Subtotal',
    //         id: 'subtotal',
    //         price: {
    //           amount: {
    //             currencyCode: 'USD',
    //             nanos: 220000000,
    //             units: 32,
    //           },
    //           type: 'ESTIMATE',
    //         },
    //         type: 'SUBTOTAL',
    //       },
    //       {
    //         name: 'Tax',
    //         id: 'tax',
    //         price: {
    //           amount: {
    //             currencyCode: 'USD',
    //             nanos: 780000000,
    //             units: 2,
    //           },
    //           type: 'ESTIMATE',
    //         },
    //         type: 'TAX',
    //       },
    //     ],
    //     totalPrice: {
    //       amount: {
    //         currencyCode: 'USD',
    //         nanos: 0,
    //         units: 35,
    //       },
    //       type: 'ESTIMATE',
    //     },
    //   };


    if (conv.data.deliveryAddress) {
        order.extension = {
            '@type': GENERIC_EXTENSION_TYPE,
            'locations': [{
                type: 'DELIVERY',
                location: {
                    postalAddress: conv.data.deliveryAddress.postalAddress,
                },
            }, ],
        };
    }

    conv.ask(new TransactionDecision({
        orderOptions: {
            requestDeliveryAddress: true,
        },
        paymentOptions: {
            actionProvidedOptions: {
                paymentType: 'PAYMENT_CARD',
                displayName: 'VISA-1234',
            },
        },
        proposedOrder: order,
    }));
});

app.intent('transaction_decision_complete', (conv) => {
    console.log('Transaction decision complete');
    const arg = conv.arguments.get('TRANSACTION_DECISION_VALUE');
    if (arg && arg.userDecision === 'ORDER_ACCEPTED') {
        const finalOrderId = arg.order.finalOrder.id;

        // Confirm order and make any charges in order processing backend
        // If using Google provided payment instrument:
        // const paymentDisplayName = arg.order.paymentInfo.displayName;
        conv.ask(new OrderUpdate({
            actionOrderId: finalOrderId,
            orderState: {
                label: 'Order created',
                state: 'CREATED',
            },
            lineItemUpdates: {},
            updateTime: new Date().toISOString(),
            receipt: {
                confirmedActionOrderId: UNIQUE_ORDER_ID,
            },
            // Replace the URL with your own customer service page
            orderManagementActions: [{
                button: {
                    openUrlAction: {
                        url: 'http://google.com/',
                    },
                    title: 'Customer Service',
                },
                type: 'CUSTOMER_SERVICE',
            }, ],
            userNotification: {
                text: 'Notification text.',
                title: 'Notification Title',
            },
        }));
        conv.ask(`Заказ успешно создан!`);
    } else if (arg && arg.userDecision === 'DELIVERY_ADDRESS_UPDATED') {
        conv.ask(new DeliveryAddress({
            addressOptions: {
                reason: 'Чтобы узнать, куда выслать заказ',
            },
        }));
    } else {
        conv.close('К сожалению, не удалось разместить заказ');
    }
});

app.intent('Default Welcome Intent - custom', (conv, {
    name
}) => {
    // var url = "https://cameraobscura-dot-1-dot-doubleb-automation-production.appspot.com/api/menu";
    // getMenuJSON(url, function (err, body) {
    //     if (err) {
    //         console.log(err);
    //     } else {
    //         menu = body;
    //     }
    // });
    var res = request("GET", "https://cameraobscura-dot-1-dot-doubleb-automation-production.appspot.com/api/menu");
    menu = JSON.parse(res.body.toString('utf-8'));

    conv.ask('Приятно познакомиться, ' + name + '. Чем могу помочь?');
    conv.ask(new Suggestions('Все функции', 'Оформить заказ', 'Повторить последний заказ', 'Статус текущего заказа', 'Баланс'));
});

app.intent('Balance status', (conv) => {
    // conv.ask(menu[0].info.title);

    // var download = require('download-file');

    // var url = "https://cameraobscura-dot-1-dot-doubleb-automation-production.appspot.com/api/menu";
    // var options = {
    //     directory: "./",
    //     filename: "menu.json",
    //     json: true
    // }
    // download(url, options, function(err) {
    //     if (err) throw err
    // })

    // var fs = require('fs');
    // var json = JSON.parse(fs.readFileSync('./menu.json', 'utf8'));
    // conv.ask(json);

    console.log(menu);
    conv.ask(menu.menu[0].info.title);
    // conv.ask(BalanceStatus());
    // conv.ask(new Suggestions('Оформить новый заказ', 'Повторить последний заказ', 'Статус текущего заказа'));
});

app.intent('Order status', (conv) => {
    conv.ask(OrderStatus());
    // conv.ask(new Suggestions('Оформить новый заказ', 'Баланс', 'Повторить последний заказ'));
});

app.intent('Information desk', (conv) => {
    // if (!conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT')) {
    //   conv.ask('Sorry, try this on a screen device or select the ' +
    //     'phone surface in the simulator.');
    //   return;
    // }
    conv.ask('Возможности приложения');
    if (conv.screen) return conv.ask(HelpList());
});

app.intent('Handler', (conv) => {
    // let intentMap = new Map();
    const choice = conv.arguments.get('OPTION');
    if (choice === 'balance status') {
        conv.ask(BalanceStatus());
        // conv.ask(new Suggestions('Оформить новый заказ', 'Повторить последний заказ', 'Статус текущего заказа'));
    } else if (choice === 'order status') {
        conv.ask(OrderStatus());
        // conv.ask(new Suggestions('Оформить новый заказ', 'Баланс', 'Повторить последний заказ'));
    } else if (choice === 'order making') {
        // conv.followup('Make-order-custom');
    } else {
        conv.ask('Вы ничего не выбрали');
    }
});

// Set the DialogflowApp object to handle the HTTPS POST request.
exports.dialogflowFirebaseFulfillment = functions.https.onRequest(app);