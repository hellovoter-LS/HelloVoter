import React, { PureComponent } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
  FlatList,
  Dimensions,
  TouchableHighlight,
  TouchableOpacity,
} from 'react-native';

import Icon from 'react-native-vector-icons/FontAwesome';
import Modal from 'react-native-simple-modal';
import KnockPage from '../KnockPage';

import t from 'tcomb-form-native';

var Form = t.form.Form;

var mainForm = t.struct({
  'unit': t.String,
});

export default class App extends PureComponent {

  constructor(props) {
    super(props);
    this.state = {
      refer: props.navigation.state.params.refer,
      marker: props.navigation.state.params.marker,
      form: props.navigation.state.params.refer.state.form,
      isKnockMenuVisible: false,
    };
  }

  render() {
    const { refer, marker } = this.state;

    return (
      <ScrollView style={{flex: 1, backgroundColor: 'white'}} contentContainerStyle={{flexGrow:1}}>
        <View>
          <Text style={{fontSize: 20, padding: 10}}>{marker.address.street}, {marker.address.city}</Text>

          <FlatList
            scrollEnabled={false}
            data={marker.units}
            keyExtractor={item => item.name}
            renderItem={({item}) => {
              let color = refer.getPinColor(item);
              let icon = (color === "red" ? "ban" : "address-book");

              return (
                <View key={item.name} style={{padding: 10}}>
                  <TouchableOpacity
                    style={{flexDirection: 'row', alignItems: 'center'}}
                    onPress={() => {
                      this.setState({ isKnockMenuVisible: true, marker: marker, currentUnit: item });
                    }}>
                    <Icon name={icon} size={40} color={color} style={{margin: 5}} />
                    <Text>Unit {item.name} - {refer.getLastVisit(item)}</Text>
                  </TouchableOpacity>
                </View>
              );
            }}
          />

        </View>

        <Modal
          open={this.state.isKnockMenuVisible}
          modalStyle={{width: 335, height: 280, backgroundColor: "transparent",
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0}}
          style={{alignItems: 'center'}}
          offset={0}
          overlayBackground={'rgba(0, 0, 0, 0.75)'}
          animationDuration={200}
          animationTension={40}
          modalDidOpen={() => undefined}
          modalDidClose={() => this.setState({isKnockMenuVisible: false})}
          closeOnTouchOutside={true}
          disableOnBackPress={false}>
          <KnockPage refer={refer} marker={marker} unit={this.state.currentUnit} />
        </Modal>

      </ScrollView>
     );
   }
}

const iconStyles = {
  justifyContent: 'center',
  borderRadius: 10,
  padding: 10,
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF',
  },
  buttonText: {
    fontSize: 18,
    color: 'white',
    alignSelf: 'center'
  },
  button: {
    height: 36,
    backgroundColor: '#48BBEC',
    borderColor: '#48BBEC',
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 10,
    alignSelf: 'stretch',
    justifyContent: 'center'
  },
  content: {
    flex: 1,
    margin: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatar: {
    margin: 20,
  },
  avatarImage: {
    borderRadius: 50,
    height: 100,
    width: 100,
  },
  centerscreen: {
    fontSize: 20,
    textAlign: 'center',
    margin: 10,
  },
  header: {
    fontSize: 22,
    marginBottom: 10,
    marginLeft: 10,
    fontWeight: 'bold',
  },
  text: {
    textAlign: 'center',
  },
  buttons: {
    justifyContent: 'space-between',
    flexDirection: 'row',
    margin: 20,
    marginBottom: 30,
  },
});
