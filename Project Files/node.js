'use strict';


const {
    BasicCard,
    Button,
    Carousel,
    DeliveryAddress,
    dialogflow,
    Image,
    List,
    OrderUpdate,
    Permission,
    Suggestions,
    TransactionDecision,
    TransactionRequirements,
} = require('actions-on-google');
var request = require('request');
var axios = require('axios')

var stringSimilarity = require('string-similarity');

const admin = require('firebase-admin');
const functions = require('firebase-functions');
admin.initializeApp(functions.config().firebase);
var db = admin.firestore();

const GENERIC_EXTENSION_TYPE =
    'type.googleapis.com/google.actions.v2.orders.GenericExtension';

const app = dialogflow({
    debug: true
});


// --------------------MISC------------------------
// --------------------begin-----------------------
function remove_irrelevant_suggestions(...categories) {
    var result = main_suggestion_list.slice();
    for (var cat in categories) {
        var idx = result.indexOf(categories[cat]);
        if (idx > -1) result.splice(idx, 1);
    }
    return result;
}

var main_suggestion_list = ['Все функции', 'Оформить заказ', 'Мои шаблоны', 'История заказов', 'Адреса ресторанов', 'Ближайшая точка'];


// Поправить
var min = 10000;
var max = 10000000000;
var order_id = Math.floor(Math.random() * (+max - +min)) + +min;


// const OrderStatus = () => {
//     // var status = ['в процессе доставки', 'готовится', 'доставлен', 'в процессе обработки'];
//     // const cur_status = status[Math.floor(Math.random() * 4)];
//     const argum = conv.arguments.get('TRANSACTION_DECISION_VALUE');
//     const minorId = arg.order.finalOrder.id;
//     return 'Статус вашего заказа: ' + cur_status;
// };

// app.intent('Order status', (conv) => {
//     conv.ask(OrderStatus(), new Suggestions(main_suggestion_list));
// });
// ---------------------end------------------------
// --------------------MISC------------------------

// ------------------READ DATA---------------------
// --------------------begin-----------------------
function getJSON(url, callback) {
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

var templatePositionsOrder = [];

var menu_json;
var loc_json;
var all_item_list = [];
var all_item_title_list = []

var url;
url = "https://cameraobscura-dot-1-dot-doubleb-automation-production.appspot.com/api/menu";
getJSON(url, function (err, body) {
    if (err) {
        console.log(err);
    } else {
        menu_json = body.menu;
        for (var cat_idx = 0; cat_idx != menu_json.length; ++cat_idx) {
            for (var item_idx = 0; item_idx != menu_json[cat_idx].items.length; ++item_idx) {
                var item = menu_json[cat_idx].items[item_idx];
                item['category_info'] = menu_json[cat_idx]['info'];
                item['title'] = item['title'].toLowerCase();
                all_item_list.push(item);
                all_item_title_list.push(item['title']);
            }
        }
    }
});

url = "https://cameraobscura-dot-1-dot-doubleb-automation-production.appspot.com/api/venues";
getJSON(url, function (err, body) {
    if (err) {
        console.log(err);
    } else {
        loc_json = body;
    }
});

// ---------------------end------------------------
// ------------------READ DATA---------------------


// ------------------------------------------------
// ------------------INTENTS-----------------------
// ------------------------------------------------

// ----------------WELCOME INTENT------------------
// --------------------begin-----------------------

/**
 * Подгружает и обновляет все необходимые данные при запуске ассистента.
 *
 * @param {Conversation}   conv     Объект класса Conversation.
 * 
 * @return {undefined} Функция не возвращает ничего, т.к. меняет аргументы объекта conv.
 */
function update_necessary_variables(conv) {
    db.collection('users/' + conv.user.storage.userId + '/templates/').get()
        .then(snapshot => {
            if (conv.user.storage.template_count != snapshot.size) {
                conv.user.storage.template_count = snapshot.size;
            }
        });
}

function getId(conv, url, data) {
    const config = {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    }
    return axios.post(url, data, config)
        .then((value) => {
            console.log('getid');
            conv.user.storage.userId = value.data.client_id;
            conv.ask('Вы успешно зарегистрированы!');

            console.log('creating user...');
            const createUser = db.collection('users').doc(conv.user.storage.userId.toString()).set({
                    userId: conv.user.storage.userId,
                    userPhoneNumber: conv.user.storage.userPhoneNumber
                })
                .then(function () {
                    console.log("Пользователь успешно создан!");
                })
                .catch(function (error) {
                    console.error("Не удалось создать нового пользователя: ", error);
                });

            // Создадим пустой элемент шаблона
            console.log('creating template...');
            const createAddTemplate = db.doc('users/' + conv.user.storage.userId + '/templates/' + '!Добавить').set({
                    items: ['Создать новый шаблон'],
                })
                .then(function () {
                    console.log("Шаблон " + 'Добавить' + " успешно создан!");
                })
                .catch(function (error) {
                    console.error("Не удалось создать шаблон " + 'Добавить' + " : ", error);
                });
            conv.user.storage.template_count = 1;

            conv.ask('Приятно познакомиться! Чем могу помочь?');
            conv.ask(generateHelpList(), new Suggestions(main_suggestion_list));
        })
        .catch(err => {
            console.error(err);
            conv.close('Не удалось зарегистрироваться, попробуйте, пожалуйста, позже.');
        })
}

app.intent('Welcome', (conv) => {
    console.log(conv.user.storage.userName + ': Welcome');

    // conv.user.storage = {};
    templatePositionsOrder = [];

    if ('userId' in conv.user.storage) {
        conv.ask('Здравствуйте! Чем могу помочь?');
        if (conv.screen) return conv.ask(generateHelpList(), new Suggestions(remove_irrelevant_suggestions('Все функции')));
    } else {
        conv.ask("Похоже, это наше первое знакомство. Для регистрации продиктуйте или напечатайте, пожалуйста, свой номер телефона в формате '71234567890'");
    }
});


app.intent('Welcome - register_new_user', (conv, {
    number
}) => {
    console.log(conv.user.storage.userName + ': Welcome - register_new_user');

    conv.user.storage.userPhoneNumber = number.toString().replace(/\s/g, '');
    const data = "alisa_id=123123123&device_phone=" + conv.user.storage.userPhoneNumber;
    console.log('data', data);

    if (number.length != 11) {
        return conv.close('Неправильный формат номера, попробуйте ещё раз');
    }

    // Получение айди
    return getId(
        conv, 'https://cameraobscura-dot-1-dot-doubleb-automation-production.appspot.com/api/register', data
    );
});
// ---------------------end------------------------
// ----------------WELCOME INTENT------------------


// ------------------TEMPLATES---------------------
// --------------------begin-----------------------
function remove_template(conv, title) {
    conv.user.storage.template_count -= 1;
    return db.doc('users/' + conv.user.storage.userId + '/templates/' + title).delete()
        .then(function () {
            console.log("Шаблон успешно удалён!");
            conv.ask('Шаблон ' + title + ' успешно удален!', new Suggestions(main_suggestion_list));
        })
        .catch(function (error) {
            console.error("Не удалось удалить шаблон: ", error);
            conv.exit('Не удалось удалить шаблон ' + title + '!');
        });
}

/**
 * Возвращает response с листом всех шаблонов для данного юзера.
 *
 * @param {Conversation}    conv    Объект класса Conversation.
 *
 * @param {String}          purpose Форматная строка для обработки OPTION.
 * 
 * @return {response} Функция возвращает response в виде conv.ask()
 */
function list_all_templates(conv, purpose) {
    return db.collection('users/' + conv.user.storage.userId + '/templates/').get()
        .then(snapshot => {
            var all_temp_dict = {};
            var template_title_list = [];

            snapshot.forEach(doc => {
                var cur_object = "template " + purpose + " " + doc.id.replace(/!/, "");
                all_temp_dict[cur_object] = {
                    title: doc.id.replace(/!/, ""),
                    description: doc.data()['items'].sort().join(', ')
                };

                template_title_list.push(doc.id.replace(/!/, ""));
            });

            Object.values(all_temp_dict)[0]['image'] = new Image({
                url: 'https://cdn2.iconfinder.com/data/icons/circle-icons-1/64/magicwand-256.png',
            });

            conv.ask(new List({
                items: all_temp_dict
            }), new Suggestions(template_title_list));
        })
        .catch(err => {
            console.log('Ошибка в получении документов', err);
            conv.close('Ошибка в получении документов');
        });
}

function view_template(conv, title) {
    return db.doc('users/' + conv.user.storage.userId + '/templates/' + title).get()
        .then(doc => {
            var order_positions = doc.data()['items'].sort();
            var formatted_string = '';
            for (var i = 0; i < order_positions.length; ++i) {
                formatted_string += '• **' + order_positions[i].toLowerCase().trim() + '**  \n';
            }
            conv.ask(new BasicCard({
                text: formatted_string,
                title: doc.id,
                image: new Image({
                    url: 'https://cdn2.iconfinder.com/data/icons/circle-icons-1/64/star-512.png',
                    alt: 'current_template'
                }),
            }));
        })
        .catch(err => {
            console.log('Ошибка в получении шаблона', err);
            conv.close('Ошибка в получении шаблона');
        });
}

function search_for_position_template(input_str) {
    input_str = input_str.toLowerCase();
    var best_match = stringSimilarity.findBestMatch(input_str, all_item_title_list).bestMatch.target;
    for (var cat_idx = 0; cat_idx != menu_json.length; ++cat_idx) {
        for (var item_idx = 0; item_idx != menu_json[cat_idx].items.length; ++item_idx) {
            var item = menu_json[cat_idx].items[item_idx];
            if (item.title.toLowerCase() == best_match) {
                // поменять на positions_menu
                return item.title.toLowerCase().trim();
            }
        }
    }
    return 0;
}

function add_template(conv) {
    return db.doc('users/' + conv.user.storage.userId + '/templates/' + conv.data.templateTitle).set({
            items: conv.data.templatePositions,
        })
        .then(function () {
            console.log("Шаблон " + conv.data.templateTitle + " успешно создан!");
            conv.user.storage.template_count += 1;
            conv.ask("Отлично, шаблон " + conv.data.templateTitle + " добавлен!", new Suggestions(main_suggestion_list));
        })
        .catch(function (error) {
            console.error("Не удалось создать шаблон " + conv.data.templateTitle + " : ", error);
            conv.ask("Не удалось добавить шаблон");
        });
}

app.intent('View Templates', (conv) => {
    console.log(conv.user.storage.userName + ': View Templates');

    if (conv.user.storage.template_count > 1) {
        conv.ask('Всего шаблонов: ' + (conv.user.storage.template_count - 1));
        if (conv.screen) {
            return list_all_templates(conv, 'view');
        }
    } else {
        conv.ask('Похоже, у вас ещё нет ни одного шаблона. Хотите создать новый?');
        conv.ask(new Suggestions('Да', 'Нет'));
    }
});

app.intent('View Templates - create_yes', (conv) => {
    console.log(conv.user.storage.userName + ': View Templates - create_yes');

    conv.followup("ViewTemplates-create_new");
});

app.intent('View Templates - create_no', (conv) => {
    console.log(conv.user.storage.userName + ': View Templates - create_no');

    conv.ask('Хорошо, может быть в другой раз!', new Suggestions(main_suggestion_list));
});

// has event "ViewTemplates-create_new"
app.intent('View Templates - create_new', (conv) => {
    console.log(conv.user.storage.userName + ': View Templates - create_new');

    conv.ask('Как вы хотите назвать новый шаблон?');
    conv.ask(new Suggestions('Завтрак', 'Ланч', 'Ужин'));
});

app.intent('View Templates - create_new - choose_name', (conv, {
    title
}) => {
    console.log(conv.user.storage.userName + ': View Templates - create_new - choose_name');

    if ('templateTitle' in conv.data) {
        conv.followup("template_choose_positions");
    }

    conv.data.templateTitle = title;
    conv.ask('Хорошо, какие позиции из меню добавим?', get_menu_cloud());
});

app.intent('View Templates - create_new - choose_name - choose_positions', (conv, {
    positions
}) => {
    console.log(conv.user.storage.userName + ': View Templates - create_new - choose_positions');

    var menu_positions = [];
    console.log(positions);
    for (var pos in positions) {
        menu_positions.push(search_for_position_template(positions[pos]));
    }
    conv.data.templatePositions = menu_positions;
    conv.ask('Добавляем следующие позиции, верно?', menu_positions.join('\n'));
    conv.ask(new Suggestions('Да', 'Нет'));
});

app.intent('View Templates - create_new - choose_name - choose_positions - yes', (conv) => {
    console.log(conv.user.storage.userName + ': View Templates - create_new - choose_name - choose_positions - yes');

    return add_template(conv);
});

app.intent('View Templates - create_new - choose_name - choose_positions - no', (conv) => {
    console.log(conv.user.storage.userName + ': View Templates - create_new - choose_name - choose_positions - no');

    // Можно пофиксить, если убрать лесенку из интентов, т.к. followup работает либо на текущий уровень, либо на последующие
    conv.ask("В таком случае, задайте шаблон заново.", new Suggestions(main_suggestion_list));
});

app.intent('List Option Handler - Template Delete', (conv) => {
    console.log(conv.user.storage.userName + ': List Option Handler - Template Delete');

    return remove_template(conv, conv.data.templateChoice);
});

app.intent('List Option Handler - Template Order', (conv) => {
    console.log(conv.user.storage.userName + ': List Option Handler - Template Order');

    templatePositionsOrder = [];

    db.doc('users/' + conv.user.storage.userId + '/templates/' + conv.data.templateChoice).get()
        .then((snapshot) => {
            for (var i = 0; i < snapshot.data()['items'].length; ++i) {
                templatePositionsOrder.push(snapshot.data()['items'][i]);
                console.log(templatePositionsOrder);
            }
        })
        .catch((err) => {
            console.log(err);
        })

    conv.ask('Желаете оформить доставку или забрать самому?', new Suggestions('Доставка', 'Самовывоз'));
    conv.ask(new Carousel({
        items: {
            'transaction Доставка': {
                title: 'Доставка',
                description: 'Оформить доставку на один из сохранённых адресов',
                image: new Image({
                    url: 'https://cdn2.iconfinder.com/data/icons/circle-icons-1/64/truck-512.png',
                    alt: 'delivery'
                })
            },
            'transaction Самовывоз': {
                title: 'Самовывоз',
                description: 'Оформить самовывоз из доступной точки ресторана',
                image: new Image({
                    url: 'https://cdn2.iconfinder.com/data/icons/circle-icons-1/64/travelerbag-512.png',
                    alt: 'pickup'
                })
            }
        }
    }));
});
// ---------------------end------------------------
// ------------------TEMPLATES---------------------


// -------------------ADDRESS----------------------
// --------------------begin-----------------------
const list_all_addresses = (conv) => {
    // https://www.google.com/search?newwindow=1&q=г.+москва+ул.амурская+д.7+стр.2
    var all_venues = {};
    var address_title_list = ["Ближайшая точка"];
    const order = ["Первый", "Второй", "Третий", "Четвертый", "Пятый", "Шестой", "Седьмой"];

    for (var i = 0; i < loc_json.venues.length; ++i) {
        const cur_address = loc_json.venues[i].address.toString()
        const address = cur_address[0] == 'г' ? cur_address : 'г. ' + cur_address.split("г.")[1];
        const address_info = cur_address.split("г.")[0];
        const address_time = loc_json.venues[i].schedule_str.toString();

        if (loc_json.venues.length == 1) {
            return {
                list: new BasicCard({
                    text: '**Доступ ко входу:** ' + ((cur_address[0] != 'г') ? address_info : 'для всех посетителей'),
                    subtitle: 'График работы: ' + address_time,
                    title: address,
                    buttons: new Button({
                        title: 'Перейти в Google',
                        url: 'https://www.google.com/search?newwindow=1&q=' + address.replace(/,\s|\s/g, "+"),
                    }),
                    display: 'CROPPED',
                }),
                suggestions: new Suggestions('Назад')
            };
        }

        const cur_object = "address " + address;
        all_venues[cur_object] = {
            title: address,
            description: address_time + '  \nДоступ: ' + ((cur_address[0] != 'г') ? address_info : 'для всех посетителей'),
            synonyms: [
                order[i]
            ],
        };

        if ('closestPickupAddress' in conv.data && address === conv.data.closestPickupAddress) {
            all_venues[cur_object]['image'] = new Image({
                url: 'https://cdn2.iconfinder.com/data/icons/circle-icons-1/64/crossroads-256.png',
                alt: 'closest'
            });
        }

        address_title_list.push(order[i]);
    }
    return {
        list: new List({
            items: all_venues
        }),
        suggestions: new Suggestions(address_title_list)
    };
};

function closest_address(conv, coordinates) {
    var m = 1e5,
        ad = "Не найдено",
        address_time;
    for (var i = 0; i < loc_json.venues.length; i++) {
        var cur_item = loc_json.venues[i];
        var euq = Math.sqrt(Math.pow(parseFloat(coordinates.latitude) - cur_item.lat, 2) + Math.pow(parseFloat(coordinates.longitude) - cur_item.lon, 2));
        if (euq <= m) {
            m = euq;
            ad = cur_item.address;
            address_time = loc_json.venues[i].schedule_str.toString();
        }
    }

    const address = ad[0] == 'г' ? ad : 'г. ' + ad.split("г.")[1];
    const address_info = ad.split("г.")[0];

    conv.data.closestPickupAddress = address;

    return new BasicCard({
        // https://www.google.com/search?newwindow=1&q=г.+москва+ул.амурская+д.7+стр.2
        text: '**Доступ ко входу:** ' + ((ad[0] != 'г') ? address_info.replace('!', '') : 'для всех посетителей'),
        subtitle: 'График работы: ' + address_time,
        title: address,
        buttons: new Button({
            title: 'Перейти в Google',
            url: 'https://www.google.com/search?newwindow=1&q=' + address.replace(/,\s|\s/g, "+"),
        }),
        display: 'CROPPED',
    });
}

app.intent('List All Addresses', (conv) => {
    console.log(conv.user.storage.userName + ': List All Addresses');

    var all_addresses = list_all_addresses(conv);
    conv.ask('Вот все доступные пункты самовывоза:');
    if (conv.screen) return conv.ask(all_addresses.list, all_addresses.suggestions);
});

app.intent('Closest Addresses', (conv) => {
    console.log(conv.user.storage.userName + ': Closest Addresses');

    conv.data.requestedPermission = 'DEVICE_PRECISE_LOCATION';
    return conv.ask(new Permission({
        context: 'Чтобы узнать ваше текущее местоположение',
        permissions: conv.data.requestedPermission,
    }));

});

app.intent('Closest addresses - permission_processing', (conv, params, permissionGranted) => {
    console.log(conv.user.storage.userName + ': Closest addresses - permission_processing');

    if (permissionGranted) {
        const {
            requestedPermission
        } = conv.data;
        if (requestedPermission === 'DEVICE_PRECISE_LOCATION') {
            const {
                coordinates
            } = conv.device.location;
            if (coordinates) {
                return conv.ask('Теперь эта точка будет отмечена в списке всех адресов:',
                    closest_address(conv, coordinates),
                    new Suggestions("Все функции", "Все адреса", "Назад")
                    // new Suggestions(remove_irrelevant_suggestions('Ближайшая точка'))
                );
            } else {
                return conv.ask('К сожалению, не могу определить ваше местоположение.', new Suggestions(main_suggestion_list));
            }
        } else {
            return conv.ask('К сожалению, не могу получить доступ к местоположению.', new Suggestions(main_suggestion_list))
        }
    } else {
        return conv.ask('К сожалению, доступ к местоположению отклонен.', new Suggestions(main_suggestion_list));
    }
});
// ---------------------end------------------------
// -------------------ADDRESS----------------------


// -----------------TRANSACTION--------------------
// --------------------begin-----------------------
function search_for_position_menu(input_str) {
    input_str = input_str.toLowerCase();
    var best_match = stringSimilarity.findBestMatch(input_str, all_item_title_list).bestMatch.target;
    for (var cat_idx = 0; cat_idx != menu_json.length; ++cat_idx) {
        for (var item_idx = 0; item_idx != menu_json[cat_idx].items.length; ++item_idx) {
            var item = menu_json[cat_idx].items[item_idx];
            if (item.title.toLowerCase() == best_match) {
                var result = {
                    category: menu_json[cat_idx].info,
                    item: item
                };
                return result;
            }
        }
    }
    return 0;
}

function get_menu_cloud() {
    var items = [];
    for (var i = 0; i < all_item_list.length; ++i) {
        var item = all_item_list[i];
        items.push('• **' + item.title.toLowerCase().trim() + '** - _' + item.price + ' руб._');
    }
    // for (var cat_idx = 0; cat_idx != menu_json.length; ++cat_idx) {
    //     for (var item_idx = 0; item_idx != menu_json[cat_idx].items.length; ++item_idx) {
    //         var item = menu_json[cat_idx].items[item_idx];
    //         items.push('• **' + item.title.toLowerCase().trim() + '** - _' + item.price + ' руб._');
    //     }
    // }

    var min = 0;
    var max = items.length - 1;
    var menu_cloud = [];
    for (var i = 0; i < 10; ++i) {
        menu_cloud.push(items[Math.floor(Math.random() * (+max - +min)) + +min]);
    }
    menu_cloud.sort(function (a, b) {
        return a.length - b.length || a.localeCompare(b);
    });

    console.log(menu_cloud);
    return new BasicCard({
        text: menu_cloud.join('  \n'),
        subtitle: 'Например, вы можете заказать...',
        title: 'Помощь в выборе',
    });
}

app.intent('transaction_check_action', (conv) => {
    console.log(conv.user.storage.userName + ': transaction_check_action');

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
    console.log(conv.user.storage.userName + ': transaction_check_complete');

    const arg = conv.arguments.get('TRANSACTION_REQUIREMENTS_CHECK_RESULT');
    if (arg && arg.resultType === 'OK') {
        conv.followup('action_intent_pickup_or_delivery');
    } else {
        return conv.close('Transaction failed.');
    }
});

app.intent('actions_intent_PICKUP_OR_DELIVERY', (conv) => {
    console.log(conv.user.storage.userName + ': actions_intent_PICKUP_OR_DELIVERY');

    conv.ask('Желаете оформить доставку или забрать самому?', new Suggestions('Доставка', 'Самовывоз'));
    conv.ask(new Carousel({
        items: {
            'transaction Доставка': {
                title: 'Доставка',
                description: 'Оформить доставку на один из сохранённых адресов',
                image: new Image({
                    url: 'https://cdn2.iconfinder.com/data/icons/circle-icons-1/64/truck-512.png',
                    alt: 'delivery'
                })
            },
            'transaction Самовывоз': {
                title: 'Самовывоз',
                description: 'Оформить самовывоз из доступной точки ресторана',
                image: new Image({
                    url: 'https://cdn2.iconfinder.com/data/icons/circle-icons-1/64/travelerbag-512.png',
                    alt: 'pickup'
                })
            }
        }
    }));
});

app.intent('List Option Handler - Address Choice Pickup', (conv) => {
    console.log(conv.user.storage.userName + ': List Option Handler - Address Choice Pickup');

    var all_addresses = list_all_addresses(conv);
    conv.ask('Пожалуйста, выберите пункт самовывоза:');
    if (conv.screen) return conv.ask(all_addresses.list, all_addresses.suggestions);
});

app.intent('List Option Handler - Address Choice Delivery', (conv) => {
    console.log(conv.user.storage.userName + ': List Option Handler - Address Choice Delivery');

    conv.ask(new DeliveryAddress({
        addressOptions: {
            reason: 'Чтобы узнать, куда доставить заказ',
        }
    }));
});

app.intent('actions_intent_DELIVERY_ADDRESS', (conv) => {
    console.log(conv.user.storage.userName + ': actions_intent_DELIVERY_ADDRESS');

    const arg = conv.arguments.get('DELIVERY_ADDRESS_VALUE');
    if (arg.userDecision === 'ACCEPTED') {
        console.log('DELIVERY ADDRESS: ' +
            arg.location.postalAddress.addressLines[0]);
        conv.data.deliveryAddress = arg.location;
        conv.ask('Отлично, доставим на адрес ' + arg.location.postalAddress.addressLines[0] + '. Что будем заказывать?');

        if (templatePositionsOrder.length > 0) {
            conv.followup("transaction_decision_action_event");
        } else {
            conv.ask(get_menu_cloud());
        }
    } else {
        conv.ask('Хорошо, можете выбрать другую опцию', new Suggestions(main_suggestion_list));
    }
});

app.intent('transaction_decision_action', (conv, {
    menu
}) => {
    console.log(conv.user.storage.userName + ': transaction_decision_action');

    if (!('deliveryAddress' in conv.data)) {
        return conv.close("Извините, но вы пока не выбрали адрес доставки");
    }

    console.log(templatePositionsOrder);
    if (templatePositionsOrder.length > 0) {
        menu = templatePositionsOrder;
    }

    var positions = [];
    var total_value = 0;
    for (var i = 0; i < menu.length; i++) {
        var cur_object = search_for_position_menu(menu[i]);
        if (!cur_object) {
            continue;
        }

        var new_pos = {
            name: cur_object.item.title.toString(),
            id: cur_object.item.id.toString(),
            price: {
                amount: {
                    currencyCode: 'RUB',
                    nanos: 0,
                    units: cur_object.item.price,
                },
                type: 'ACTUAL',
            },
            quantity: 1,
            subLines: [{
                note: cur_object.category.title.toString(),
            }],
            type: 'REGULAR',
        };
        total_value += cur_object.item.price;
        positions.push(new_pos);
    }

    const order = {
        id: order_id.toString(),
        cart: {
            merchant: {
                id: 'Camera_Obscura',
                name: 'Camera Obscura',
            },
            lineItems: positions,
            notes: 'Your Order №' + order_id.toString(),
            otherItems: [{
                name: 'Subtotal',
                id: 'subtotal',
                price: {
                    amount: {
                        currencyCode: 'RUB',
                        nanos: 0,
                        units: total_value,
                    },
                    type: 'ACTUAL',
                },
                type: 'SUBTOTAL',
            }, ],
        },
        otherItems: [],
        totalPrice: {
            amount: {
                currencyCode: 'RUB',
                nanos: 0,
                units: total_value,
            },
            type: 'ACTUAL',
        },
    };

    console.log('postal address: ', conv.data.deliveryAddress);
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
    console.log(conv.user.storage.userName + ': transaction_decision_complete');

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
        conv.ask('Заказ №' + finalOrderId + ' успешно создан!', new Suggestions(main_suggestion_list));
    } else if (arg && arg.userDecision === 'DELIVERY_ADDRESS_UPDATED') {
        conv.ask(new DeliveryAddress({
            addressOptions: {
                reason: 'Чтобы узнать, куда выслать заказ',
            },
        }));
    } else {
        conv.ask('К сожалению, не удалось разместить заказ', new Suggestions(main_suggestion_list));
    }
});
// ---------------------end------------------------
// -----------------TRANSACTION--------------------


// ----------------HISTORY INTENT-----------------
// --------------------begin-----------------------

function list_all_orders(conv) {
    var url = "https://cameraobscura-dot-1-dot-doubleb-automation-production.appspot.com/api/history";
    var config = {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Client-Id': conv.user.storage.userId.toString(),
            // 'Client-Id': '19'
        }
    };

    return axios.get(url, config)
        .then((value => {
            var all_orders_dict = {};
            var orders = value.data.orders;
            console.log(orders);
            if (orders.length == 0) {
                conv.ask('У вас пока что нет ни одного заказа, хотите оформить новый?',
                new Suggestions('Оформить заказ', 'Назад'));
            } else if (orders.length == 1) {
                conv.ask(new BasicCard({
                    text: 'Дата заказа: ' + orders[0]['delivery_time_str'] + ' , сумма заказа: ' + orders[0]['total'],
                    title: 'Заказ №' + orders[0]['order_id'],
                }));
            } else {
                // var limit = Math.max(orders.length, 30);
                for (var i = 0; i < orders.length; ++i) {
                    var cur_object = "order " + orders[i]['order_id'];
                    all_orders_dict[cur_object] = {
                        title: 'Заказ №' + orders[i]['order_id'],
                        // subtitle: 'Дата заказа: ' + orders[i]['delivery_time_str'] + ' , сумма заказа: ' + orders[i]['total'],
                        description: 'Дата заказа: ' + orders[i]['delivery_time_str'] + ' , сумма заказа: ' + orders[i]['total']
                    };
                }

                conv.ask(new List({
                    items: all_orders_dict
                }));
            }
        }))
        .catch(err => {
            console.log('Ошибка в получении заказов', err);
            conv.close('Ошибка в получении заказов');
        });
}

function view_order(conv, order_id) {
    var url = "https://cameraobscura-dot-1-dot-doubleb-automation-production.appspot.com/api/history";
    var config = {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Client-Id': conv.user.storage.userId.toString(),
            // 'Client-Id': '19'
        }
    };

    return axios.get(url, config)
        .then(value => {
            var orders = value.data.orders;
            var order_id = conv.data.viewOrderId;

            for (var i = 0; i < orders.length; ++i) {
                if (orders[i]['order_id'] == order_id) {
                    var order_items = '';

                    for (var j = 0; j < orders[i]['items'].length; ++j) {
                        order_items += '• ' + orders[i]['items'][j]['title'] + ': ' + orders[i]['items'][j]['quantity'] + 'шт.  \n';
                    }

                    conv.ask(new BasicCard({
                        text: '**Cумма заказа**: ' + orders[0]['total'] + 'руб.  \n' + order_items,
                        subtitle: 'Дата заказа: ' + orders[0]['delivery_time_str'],
                        title: 'Заказ №' + orders[0]['order_id'],
                    }), new Suggestions('Назад'));
                }
            }
        })
        .catch(err => {
            console.log("Ошибка в получении заказа", err);
            conv.close("Ошибка в получении заказа");
        });
}

app.intent('Order History', (conv) => {
    console.log('Order History');

    conv.ask('История ваших заказов:');
    return list_all_orders(conv);
});

app.intent('List Option Handler - View Order', (conv) => {
    console.log('List Option Handler - View Order');

    conv.ask('Вот описание вашего заказа:');
    return view_order(conv);
});

// ---------------------end-----------------------
// ----------------HISTORY INTENT-----------------

// ----------------HELPLIST INTENT-----------------
// --------------------begin-----------------------
const generateHelpList = () => {
    const lst = new List({
        items: {
            'helper order making': {
                title: 'Оформить заказ',
                description: 'Создание и оформление заказа с выбором опции: доставка или самовывоз',
                image: new Image({
                    url: 'https://cdn2.iconfinder.com/data/icons/circle-icons-1/64/rocket-256.png',
                }),
            },
            'helper view templates': {
                title: 'Мои шаблоны',
                description: 'Просмотр и управление текущими шаблонами',
                image: new Image({
                    url: 'https://cdn2.iconfinder.com/data/icons/circle-icons-1/64/ribbon-256.png',
                }),
            },
            'helper order history': {
                title: 'История заказов',
                description: 'Просмотр истории заказов, совершённых с данного аккаунта',
                image: new Image({
                    url: 'https://cdn2.iconfinder.com/data/icons/circle-icons-1/64/video-128.png',
                }),
            },
            'helper all addresses': {
                title: 'Все адреса',
                description: 'Все доступные точки для самовывоза из ресторанов сети',
                image: new Image({
                    url: 'https://cdn2.iconfinder.com/data/icons/circle-icons-1/64/contacts-256.png',
                }),
            },
            'helper closest address': {
                title: 'Ближайшая точка самовывоза',
                description: 'Просмотр адреса ближайшей к текущему местоположению точки самовывоза',
                image: new Image({
                    url: 'https://cdn2.iconfinder.com/data/icons/circle-icons-1/64/compass-256.png',
                }),
            },
            // 'helper order status': {
            //     title: 'Статус текущего заказа',
            //     description: 'Узнать о состоянии текущего заказа',
            //     image: new Image({
            //         url: 'https://cdn2.iconfinder.com/data/icons/transport-60/614/4_-_Van-512.png',
            //     }),
            // },
        }
    });
    return lst;
};

app.intent('Information desk', (conv) => {
    console.log(conv.user.storage.userName + ': Information desk');

    conv.ask('Все функции:');
    if (conv.screen) return conv.ask(generateHelpList(), new Suggestions(remove_irrelevant_suggestions('Все функции')));
});

// app.intent('Dynamic Reprompt Intent', (conv) => {
//     const repromptCount = parseInt(conv.arguments.get('REPROMPT_COUNT'));
//     if (repromptCount === 0) {
//         conv.ask(`What was that?`);
//     } else if (repromptCount === 1) {
//         conv.ask(`Sorry I didn't catch that. Could you repeat yourself?`);
//     } else if (conv.arguments.get('IS_FINAL_REPROMPT')) {
//         conv.close(`Okay let's try this again later.`);
//     }
// });
// ---------------------end------------------------
// ----------------HELPLIST INTENT-----------------


app.intent('List Option Handler', (conv) => {
    console.log(conv.user.storage.userName + ': List Option Handler');

    const choice = conv.arguments.get('OPTION');
    const choice_split = choice.split(' ');

    if (choice_split[0] == 'helper') {
        var request = choice_split.slice(1).join(' ');
        switch (request) {
            case 'order making':
                conv.followup("OrderMaking");
                break;
            case 'view templates':
                conv.followup("ViewTemplates");
                break;
            case 'order history':
                conv.followup('OrderHistory');
                break;
            case 'all addresses':
                conv.followup("AllAddresses");
                break;
            case 'closest address':
                conv.followup("ClosestAddress");
                break;
            default:
                conv.ask("Не могу обработать ваш запрос", new Suggestions(main_suggestion_list));
        }
    } else if (choice_split[0] == 'template') {
        if (choice_split[1] == 'view') {
            var title = choice_split.slice(2).join(' ');

            if (title === 'Добавить') {
                conv.followup('ViewTemplates-create_new');
            } else {
                conv.ask('Выбран шаблон ' + title + '. Что необходимо сделать?');
                conv.data.templateChoice = title;
                conv.ask(new Suggestions("Заказать", "Удалить"));

                return view_template(conv, title);
            }
        }
    } else if (choice_split[0] == 'address') {
        // Поменять поля на те, что в базе
        conv.data.deliveryAddress = {
            postalAddress: {
                regionCode: 'RU',
                recipients: ['Самовывоз'],
                // postalCode: '125319',
                locality: 'Москва',
                addressLines: [choice_split.slice(1).join(' '), ''],
                languageCode: 'en-US',
                administrativeArea: 'Moskva'
            }
        };
        conv.ask('Отлично, доставим на адрес ' + conv.data.deliveryAddress.postalAddress.addressLines[0] + '. Что будем заказывать?');
        if (templatePositionsOrder.length > 0) {
            conv.followup("transaction_decision_action_event");
        } else {
            conv.ask(get_menu_cloud());
        }
    } else if (choice_split[0] == 'transaction') {
        if (choice_split[1] == 'Доставка') {
            conv.followup('DeliveryAddressChoice');
        } else if (choice_split[1] == 'Самовывоз') {
            conv.followup('PickupAddressChoice');
        } else {
            conv.close(choice);
        }
    } else if (choice_split[0] == 'order') {
        conv.data.viewOrderId = choice_split[1];
        conv.followup('ViewOrder');
    } else {
        conv.close(choice);
    }
});



// Set the DialogflowApp object to handle the HTTPS POST request.
exports.dialogflowFirebaseFulfillment = functions.https.onRequest(app);